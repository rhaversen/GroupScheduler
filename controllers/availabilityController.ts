// Node.js built-in modules

// Third-party libraries
import { type Request, type Response, type NextFunction } from 'express'

// Own modules
import AvailabilityModel, { type IAvailability } from '../models/Availability.js'
import { type IUser } from '../models/User.js'
import errors from '../utils/errors.js'
import asyncErrorHandler from '../utils/asyncErrorHandler.js'

// Destructuring and global variables
const {
    MissingFieldsError,
    UserNotFoundError,
    DatabaseError
} = errors

export const newOrUpdateAvailability = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const {
            description,
            startDate,
            endDate,
            status,
            preference
        } = req.body

        const availabilityId = req.params.id

        // Checks if description, date, status and preference are not falsy (e.g., undefined, null, empty string)
        if (!availabilityId || !startDate || !endDate || !status) {
            next(new MissingFieldsError('Missing required field(s): "availabilityId", "startDate", "endDate" or "status" ')); return
        }

        // Check if user already has a availability set for this date
        const user = req.user as IUser
        const populatedUser = await user.populate('availabilities')

        if (!populatedUser) {
            next(new UserNotFoundError('The user could not be found')); return
        }

        const existingAvailability = await AvailabilityModel.findById(availabilityId).exec() as IAvailability

        if (existingAvailability) { // Check if availability is truthy
        // Availability exists, update the provided fields instead
            existingAvailability.description = description || existingAvailability.description
            existingAvailability.startDate = startDate
            existingAvailability.endDate = endDate
            existingAvailability.status = status
            existingAvailability.preference = preference || existingAvailability.preference
            const savedAvailability = await existingAvailability.save()
            res.status(201).json(savedAvailability); return
        } // Availability is new, all fields are therefore required

        const newAvailability = new AvailabilityModel({
            description,
            startDate,
            endDate,
            status,
            preference
        }) as IAvailability

        const savedAvailability = await newAvailability.save()

        populatedUser.availabilities.push(savedAvailability._id)

        res.status(201).json(savedAvailability)
    })

export const getAvailabilities = asyncErrorHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = req.user as IUser

        if (!user) {
            next(new MissingFieldsError('Date must be specified')); return
        }

        const populatedUser = await user.populate('availabilities')

        if (!populatedUser) {
            next(new DatabaseError('Error populating user')); return
        }

        const availabilities = populatedUser.availabilities as IAvailability[]

        res.status(201).json(availabilities)
    })
