import dayjs from "dayjs";

// Display format used across the app: 29/09/2026.
// Dates come from the API as ISO timestamps in UTC (a DATE of 26-10-2026 arrives
// as "2026-10-25T18:30:00.000Z" = midnight IST), so they must be formatted in
// local time — slicing the string would show the day before.
export const formatDate = (value) =>
    value && dayjs(value).isValid()
        ? dayjs(value).format("DD/MM/YYYY")
        : "-";
