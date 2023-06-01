import { toursRepository } from "data";
import Tour from "models/Tour";

async function getTour(tourId: string): Promise<Tour> {
    const tour = await toursRepository.findById(tourId);
    return tour;
}

export async function createNamespace(tourId: string): Promise<void> {
    const tour = await getTour(tourId);
    console.log(`Creating namespace for tour ${tourId}: ${tour.name}`);
}