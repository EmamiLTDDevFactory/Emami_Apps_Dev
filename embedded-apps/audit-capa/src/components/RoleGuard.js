// components/RoleGuard.js

import { Navigate } from "react-router-dom";

export default function RoleGuard({
    role,
    redirectTo = "/",
    children,
}) {

    const currentUser =
        JSON.parse(
            localStorage.getItem(
                "currentUser"
            )
        );

    if (
        currentUser?.role !== role
    ) {
        return <Navigate to={redirectTo} />;
    }

    return children;
}