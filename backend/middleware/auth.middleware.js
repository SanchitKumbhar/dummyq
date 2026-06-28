const jwt = require("jsonwebtoken");
require("dotenv").config();

function verifyToken(req, res, next) {
    try {
        let token =
            req.header("Authorization") || req.cookies.token;

        if (!token) {
            return res.status(401).json({ error: "Access denied" });
        }

        // Handle Bearer token
        if (token.startsWith("Bearer ")) {
            token = token.split(" ")[1];
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.storeId = decoded.storeId;
        next();

    } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
    }
}

module.exports = verifyToken;