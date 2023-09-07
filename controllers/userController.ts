// Node.js built-in modules
import config from 'config'

// Third-party libraries
import passport from 'passport'
import validator from 'validator'
import dotenv from 'dotenv'
import { type Request, type Response, type NextFunction, type CookieOptions } from 'express'

// Own modules
import errors from '../utils/errors.js'
import { sendConfirmationEmail } from '../utils/mailer.js'
import UserModel, { type IUser } from '../models/User.js'
import asyncErrorHandler from '../utils/asyncErrorHandler.js'
import logger from '../utils/logger.js'

// Destructuring and global variables
const {
    InvalidEmailError,
    InvalidCredentialsError,
    UserNotFoundError,
    EmailAlreadyExistsError,
    MissingFieldsError,
    InvalidConfirmationCodeError,
    UserAlreadyConfirmedError,
    UserNotConfirmedError
} = errors

// Config
const sessionExpiry = Number(config.get('session.expiry'))
const sessionPersistentExpiry = Number(config.get('session.persistentExpiry'))
const nextJsPort = config.get('ports.nextJs')
const frontendDomain = config.get('frontend.domain')
const cookieOptions: CookieOptions = config.get('cookieOptions')

// Setup
dotenv.config()

export const ensureAuthenticated = 
    (req: Request, res: Response, next: NextFunction): void => {
        if (req.isAuthenticated()) {
            next(); return
        }
        // If not authenticated, you can redirect or send an error response
        res.status(401).json({ message: "Unauthorized" });
    }

export const registerUser = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        let { username, email, password, confirmPassword } = req.body

        if (!username || !email || !password || !confirmPassword) {
            next(new MissingFieldsError('Missing Username, Email, Password and/or Confirm Password')); return
        }

        if (!validator.isEmail(email)) {
            next(new InvalidEmailError('Invalid email format')); return
        }

        if (password !== confirmPassword) {
            next(new InvalidCredentialsError("Password and Confirm Password doesn't match")); return
        }

        if (String(password).length < 4) {
            next(new InvalidCredentialsError('Password must be at least 5 characters')); return
        }

        const existingUser = await UserModel.findOne({ email }).exec()
        
        if (!existingUser) {
            // User doesn't exist, create a new user
            const newUser = new UserModel({
                username,
                email,
                password
            })
            const savedUser = await newUser.save()

            const confirmationLink = generateConfirmationLink(savedUser.userCode)
            sendConfirmationEmail(email, confirmationLink)
        } else {
            if (!existingUser.confirmed) {
                // User exists, but is not confirmed. Send a new confirmation link
                const confirmationLink = generateConfirmationLink(existingUser.userCode)
                sendConfirmationEmail(email, confirmationLink)
                
                next(new UserNotConfirmedError('Email already exists but is not confirmed. Please follow the link sent to your email inbox')); return
            }
            next(new EmailAlreadyExistsError('Email already exists, please sign in instead')); return
        }

        res.status(201).json({
            message: 'Registration successful! Please check your email to confirm your account within 24 hours or your account will be deleted.'
        })
    })

function generateConfirmationLink(userCode: string): string{
    let confirmationLink: string
    // Generate confirmation link
    if (process.env.NODE_ENV === 'production') {
        confirmationLink = `http://${frontendDomain}/confirm?userCode=${userCode}`
    } else {
        confirmationLink = `http://${frontendDomain}:${nextJsPort}/confirm?userCode=${userCode}`
    }

    logger.info(confirmationLink)

    return confirmationLink
}

export const confirmUser = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Extract the confirmation code from the query parameters
        const { userCode } = req.params

        if (!userCode) {
            next(new MissingFieldsError('Confirmation code missing')); return
        }

        // Find the user with the corresponding confirmation code
        const user = await UserModel.findOne({ userCode }).exec()

        if (!user) {
            next(new InvalidConfirmationCodeError('Invalid confirmation code')); return
        }

        if (user.confirmed) {
            next(new UserAlreadyConfirmedError('User has already been confirmed')); return
        }

        // Update the user's status to 'confirmed'
        await user.confirmUser()
        await user.save()

        // Redirect the user or send a success message
        res.status(200).json({
            message: 'Confirmation successful! Your account has been activated.'
        })
    })

export const loginUserLocal = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        let { email, password } = req.body

        if (!email && !password) {
            next(new MissingFieldsError('Missing Email and Password')); return
        }
        if (!email) {
            next(new MissingFieldsError('Missing Email')); return
        }
        if (!password) {
            next(new MissingFieldsError('Missing Password')); return
        }

        passport.authenticate('local', (err: Error, user: IUser, info: { message: string }) => {
            if (err) {
                next(err); return
            }
    
            if (!user) {
                res.status(401).json({ auth: false, error: info.message }); return
            }
    
            req.login(user, err => {
                if (err) {
                    next(err); return
                }

                if (req.body.stayLoggedIn === 'true') {
                    req.session.cookie.maxAge = sessionPersistentExpiry * 1000
                } else {
                    req.session.cookie.maxAge = sessionExpiry * 1000
                }
    
                res.status(200).json({ auth: true })
            });
        })(req, res, next)
    }
) 

export const logoutUser = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        req.logout(function(err) {
            if (err) { return next(err); }

            req.session.destroy(function(sessionErr) {
                if (sessionErr) {
                    return next(sessionErr);
                }
                res.status(200).json({ message: "Logged out successfully" });
            })
        })
    }
)

export const getEvents = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = req.user as IUser
        const populatedUser = await user.populate('events')
        res.status(200).json(populatedUser.events)
    })

export const newCode = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = req.user as IUser
        // Generate a new userCode
        const userCode = await user.generateNewUserCode()
        await user.save()
        res.status(200).json({ userCode })
    })

export const followUser = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const followedUserId = req.params.userId
        const followedUser = await UserModel.findById(followedUserId).exec()
        const user = req.user as IUser

        if (!followedUser) {
            next(new UserNotFoundError('The user to be followed could not be found')); return
        }
        if (followedUser._id === user.id) {
            next(new UserNotFoundError('User cant follow or un-follow themselves')); return
        }

        await Promise.all([
            UserModel.findByIdAndUpdate(user._id, { $push: { following: followedUserId } }).exec(),
            UserModel.findByIdAndUpdate(followedUserId, { $push: { following: user._id } }).exec()
        ])

        res.status(200).json(followedUser)
    })

export const unfollowUser = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const followedUserId = req.params.userId
        const followedUser = await UserModel.findById(followedUserId).exec()
        const user = req.user as IUser

        if (!followedUser) {
            next(new UserNotFoundError('The user to be un-followed could not be found')); return
        }
        if (followedUser._id === user.id) {
            next(new UserNotFoundError('User cant follow or un-follow themselves')); return
        }

        await Promise.all([
            UserModel.findByIdAndUpdate(user._id, { $pull: { following: followedUserId } }).exec(),
            UserModel.findByIdAndUpdate(followedUserId, { $pull: { following: user._id } }).exec()
        ])

        res.status(200).json(followedUser)
    })

export const getUser = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = req.user as IUser
        res.status(200).json(user)
    })

export const updateUser = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = req.user as IUser

        const {
            newUsername,
            newPassword,
            oldPassword
        } = req.body

        if (newUsername) { user.username = newUsername }
        if (newPassword && oldPassword) {
            await user.comparePassword(oldPassword) // Throws error if password doesn't match
            user.password = newPassword
        }

        await user.save()
        res.status(200).json(user)
    })
