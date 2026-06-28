const db = require("../config/sqlite.config");

async function createstoreservice(storename, phonenumber) {
    const query = `INSERT INTO store (name, whatsapp_phone_number) VALUES (?, ?)`;

    db.run(query, [storename, phonenumber], function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log("Inserted ID:", this.lastID);
        }
    });

    return 200;
}

module.exports=createstoreservice;