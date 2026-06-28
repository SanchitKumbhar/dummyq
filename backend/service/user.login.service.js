const db = require("../config/sqlite.config");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

async function generateToken(id, phoneNumber) {

    const payload = {
        storeId: id,
        phoneNumber: phoneNumber
    };

    // 4. Generate and sign the token
    const token = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '5h' }
    );

    return token;

}

async function checkPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
}

async function getPassword(password, phoneNumber) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT store_id, store_name, password
             FROM stores
             WHERE phone_number = ?`,
            [phoneNumber],
            async (err, user) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!user) {
                    resolve(null);
                    return;
                }

                const result = await checkPassword(password, user.password);

                if (result) {
                    resolve(user);
                    return;
                }

                resolve(false);
            }
        );
    });

}

async function userloginService(phoneNumber, password) {
    try {
        const result = await getPassword(password, phoneNumber);

        if (!result) {
            return {
                status: 401,
                message: "Invalid phone number or password"
            };
        }

        const token = await generateToken(result.id, phoneNumber);

        return {
            status: 201,
            token
        };
    } catch (error) {
        console.error(error);

        return {
            status: 500,
            message: "Database error"
        };
    }

}

module.exports = userloginService;