let {PythonShell} = require("python-shell");
const {AutoQueue} = require("./data_structures/queue/auto_queue");
const {ScraperAutoQueue} = require("./data_structures/queue/scraper_auto_queue");

const scraperQueue = new ScraperAutoQueue();

module.exports = {

    loginAndScrapeGrades: function (processor, school, email, password, data_if_locked = {}, term_data_if_locked = {}, get_history = 'false', ignoreQueue = false) {
        scraperQueue.enqueue(async () => await this._loginAndScrapeGrades(processor, school, email, password, data_if_locked, term_data_if_locked, get_history), processor, ignoreQueue);
    },
    _loginAndScrapeGrades: async function (processor, school, email, password, data_if_locked = {}, term_data_if_locked = {}, get_history='false') {
        return new Promise(resolve => {
            let pythonPath;

            if (process.platform === "win32") {
                pythonPath = "py";
            } else {
                pythonPath = "python3";
            }

            let options = {
                mode: "json", // pythonPath: 'path/to/python',
                pythonOptions: ['-u'], // get print results in real-time
                scriptPath: './server',
                pythonPath: pythonPath,
                args: [school, email, password, JSON.stringify(data_if_locked), JSON.stringify(term_data_if_locked), get_history]
            };

            try {
                const pyshell = new PythonShell("./scrape.py", options);

                let queue = new AutoQueue();

                pyshell.on("message", (data) => {
                    queue.enqueue(async () => await processor(data), data.message);
                    if ('success' in data) {
                        queue.enqueue(async () => resolve());
                    }
                });
            } catch (e) {
                console.log("Server ran out of memory probably");
                processor({success: false, message: 'Something went wrong'});
                resolve();
            }
        });
    }

};

