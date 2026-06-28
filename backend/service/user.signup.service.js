const db = require("../config/sqlite.config");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

async function generateToken(id, phoneNumber) {
    return jwt.sign(
        { storeId: id, phoneNumber },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "5h" }
    );
}

function signupService(name, phonenumber, password, email, district, state, address, cache_folder) {
    return new Promise(async (resolve, reject) => {
        try {
            // 1. Hash password properly
            const hash = await bcrypt.hash(password, 10);
            console.log(name, phonenumber, password, email, district, state, address, cache_folder)
            // 2. Insert into DB (FIXED columns)
            db.run(
                `INSERT INTO stores (store_name, phone_number, password, email, district, state, address, cache_folder)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, phonenumber, hash, email, district, state, address, cache_folder],
                async function (err) {
                    if (err) return reject(err);

                    // 3. Generate token with inserted id
                    const token = await generateToken(this.lastID, phonenumber);

                    resolve({
                        status: 201,
                        token
                    });
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = signupService;