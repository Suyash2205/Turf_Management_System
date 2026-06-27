import { BookingsClient } from "@/components/bookings-client";

export default function StaffPage() {
  return (
    <BookingsClient
      defaultVenueName={process.env.KHELOMORE_VENUE_NAME || "Lush Sports"}
    />
  );
}
