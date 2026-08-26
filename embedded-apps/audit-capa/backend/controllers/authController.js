const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { findUserByUserId } = require("../models/userModel");

const login = async (req, res) => {
    try {
        const { userId, password } = req.body;

        if (!userId || !password) {
            return res.status(400).json({
                message: "User ID and password are required."
            });
        }

        const user = await findUserByUserId(userId.trim());

        if (!user) {
            return res.status(401).json({
                message: "Invalid user ID or password."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid user ID or password."
            });
        }

        const token = jwt.sign(
            {
                userId: user.user_id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "8h"
            }
        );

        return res.json({
            message: "Login successful.",
            token,
            user: {
                id: user.id,
                userId: user.user_id,
                name: user.name,
                role: user.role,
                depot: user.depot
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Internal server error."
        });
    }
};

module.exports = {
    login
};