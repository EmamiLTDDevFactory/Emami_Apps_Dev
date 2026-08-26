const bcrypt = require("bcryptjs");
const pool = require("../postgres");

const users = [
    {
        userId: "samyak",
        password: "123",
        name: "Samyak Srivastava",
        role: "CQA",
        depot: null
    },
    {
        userId: "argha",
        password: "123",
        name: "Argha Das",
        role: "CQA",
        depot: null
    },
    {
        userId: "devraj",
        password: "123",
        name: "Devraj Jatav",
        role: "CQA",
        depot: null
    },
    {
        userId: "delhi",
        password: "123",
        name: "Delhi Depot",
        role: "Depot",
        depot: "Delhi Depot"
    },
    {
        userId: "kolkata",
        password: "123",
        name: "Kolkata Depot",
        role: "Depot",
        depot: "Kolkata Depot"
    },
    {
        userId: "bangalore",
        password: "123",
        name: "Bangalore Depot",
        role: "Depot",
        depot: "Bangalore Depot"
    }
];

async function seedUsers() {
    try {

        for (const user of users) {

            const hash = await bcrypt.hash(user.password, 10);

            await pool.query(
                `
                INSERT INTO audit_capa.users
                (
                    user_id,
                    password_hash,
                    name,
                    role,
                    depot
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id)
                DO NOTHING
                `,
                [
                    user.userId,
                    hash,
                    user.name,
                    user.role,
                    user.depot
                ]
            );

            console.log(`Inserted: ${user.userId}`);
        }

        console.log("User seed completed");

        process.exit(0);

    } catch (error) {

        console.error(error);

        process.exit(1);
    }
}

seedUsers();