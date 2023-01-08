const scraper = require("./scrape");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync("credentials.json");
const credentials = low(adapter);
const dbClient = require("./dbClient");
const _ = require("lodash");
const stream = require("stream");


credentials.defaults({"school": "", "graderoom_username": "", "school_username": "", "password": "", "get_history": false}).write();

module.exports = {
    /**
     * Scrapes grades using data from credentials.json.
     * *For testing purposes only*
     *
     * @returns {Promise<void>}
     */
    external_scrape: async function () {
        let mongoUrl;
        let prod = false;
        if (process.env.NODE_ENV === "production") {
            prod = true;
            mongoUrl = process.env.DB_URL;
        } else {
            mongoUrl = "mongodb://localhost:27017";
        }
        await dbClient.config(mongoUrl, prod, process.env.port === "5998");
        let school = credentials.get("school").value();
        let school_username = credentials.get("school_username").value();
        let password = credentials.get("password").value();

        const processor = async (data) => console.log(JSON.stringify(data));
        if (school === "basis") {
            if ([school_username, password].includes("")) throw new Error("Configure credentials.json");
            await scraper.loginAndScrapeGrades(processor, school, school_username, password);
            return;
        }
        let graderoom_username = credentials.get("graderoom_username").value();

        if ([graderoom_username, school_username, password].includes("")) throw new Error("Configure credentials.json");

        let {term: oldTerm, semester: oldSemester} = (await dbClient.getMostRecentTermData(graderoom_username)).data.value;
        let term_data_if_locked = {term: oldTerm, semester: oldSemester};
        let data_if_locked = [];
        if (oldTerm && oldSemester) {
            let user = (await dbClient.getUser(graderoom_username, {[`grades.${oldTerm}.${oldSemester}`]: 1})).data.value;
            data_if_locked = user.grades[oldTerm][oldSemester].map(class_data => _.omit(class_data, ["grades"]));
        } else {
            term_data_if_locked = {};
        }

        let get_history = credentials.get("get_history").value();

        await scraper.loginAndScrapeGrades(processor, school, school_username, password, data_if_locked, term_data_if_locked, get_history);

    },

    /**
     * Backs up and then deletes all non-admin users in the database
     *
     * *For testing purposes only.*
     * *This will not do anything in a production environment.*
     */
    purge_db: function () {
        if (process.env.NODE_ENV === 'production') {
            console.log("THIS IS PROD DON'T DO IT");
            return;
        }
        // Backup
        authenticator.backupdb();

        // Delete all non-admins
        let users = authenticator.db.get("users").value();
        let usersRef = authenticator.db.get("users");
        let remainingUsers = [];
        for (let i = 0; i < users.length; i++) {
            console.log('checking ' + users[i].username);
            if (users[i].isAdmin) {
                remainingUsers.push(users[i].username);
                continue;
            }
            console.log('deleted ' + users[i].username);
            usersRef.splice(i--, 1).write();
        }
        console.log("\nRemaining Users: " + remainingUsers.length);
        for (let i = 0; i < remainingUsers.length; i++) {
            console.log(remainingUsers[i]);
        }
    },

    /**
     * Backs up the database
     */
    backup_db: function () {
        authenticator.backupdb();
    }
}