// @flow

import SimpleChanMsgPlugin from 'plugins/SimpleChanMsgPlugin';
import Norbert from 'lib/Norbert';

export default class HistoryPlugin extends SimpleChanMsgPlugin {
    stmt:Object;
    recent: {[channel:string]:{[type:string]:[Object]}};

    getName() {
        return "History";
    }

    getHelp() {
        return {
            overview: "History plugin, required for many other plugins.",
            commands: {
                'seen': "(user) - search history for a user."
            }
        };
    }

    init(norbert:Norbert) {
        super.init(norbert);

        this.log.trace({
            tableInit: {
                table: 'history'
            }
        });

        norbert.db.run("" +
            "CREATE TABLE IF NOT EXISTS history (" +
            "ID integer primary key, " +
            "`to` TEXT, " +
            "`from` TEXT, " +
            "message TEXT, " +
            "event TEXT, " +
            "timestamp INTEGER" +
            ")", () => {

                this.stmt = norbert.db.prepare("" +
                    "INSERT INTO history " +
                    "(`to`, `from`, message, timestamp, event) " +
                    "VALUES (?, ?, ?, ?, ?)");
        });

        this.recent = {};
    }

    getCommands() {
        return {
            seen: this.findInHistory.bind(this)
        }
    }

    findInHistory(channel:string, sender:string, message:string, norbert:Norbert) {
        const stmt =
            norbert.db.prepare("SELECT * FROM history WHERE `from` = ? ORDER BY ID DESC LIMIT 1");

        this.log.trace({
           findInHistory: {
               channel: channel,
               "requested by": sender,
               message: message
           }
        });

        stmt.all([message], (err, rows) => {
            if(err) {
                console.error(err);
                norbert.client.say("Error");
                return;
            }

            if (rows.length > 0) {
                norbert.client.say(channel, HistoryPlugin.createMessageFromRow(rows[0]));
            } else {
                norbert.client.say(channel, `${sender}, I don't remember ${message} at all, sadly.`);
            }

        });
    }

    static createMessageFromRow(row : {to:string, from:string, message: string, timestamp: number, event:string}){
        const humanDate = new Date(row.timestamp).toLocaleDateString('en-US',
            {hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short'});

        switch(row.event) {
            case 'MESSAGE':
                return `${row.from} was last seen saying ${row.message} in ${row.to} on ${humanDate}`;
            case "JOIN":
                return `${row.from} was last seen joining ${row.to} on ${humanDate}`;
            case "PART":
                return `${row.from} was last seen leaving ${row.to} on ${humanDate}`;
            case "QUIT":
                return `${row.from} was last seen quitting IRC on ${humanDate}`;
            case "RECEIVE_KICK":
                return `${row.from} was last seen being kicked by ${row.message} from ${row.to} on ${humanDate}`;
            case "KICK":
                return `${row.from} was last seen kicking ${row.message} from ${row.to} on ${humanDate}`;
            case "NICK":
                return `${row.from} was last seen changing nick to ${row.to} on ${humanDate}`;
        }
    }

    subscribe(norbert:Norbert) {
        super.subscribe(norbert);

        norbert.client.on('message', this.logMessage.bind(this, norbert, 'MESSAGE'));
        norbert.client.on('join', this.logMessage.bind(this, norbert, 'JOIN'));
        norbert.client.on('part', this.logMessage.bind(this, norbert, 'PART'));
        norbert.client.on('quit', this.logMessage.bind(this, norbert, 'QUIT'));
        norbert.client.on('nick', this.logMessage.bind(this, norbert, 'NICK'));
        norbert.client.on('kick', (from:string, to:string, message:string) => {
            this.logMessage(norbert, "KICK", message, from, to);
            this.logMessage(norbert, "RECEIVE_KICK", to, from, message);
        });

    }

    reset(norbert:Norbert) {
        super.reset(norbert);

        norbert.db.run("TRUNCATE TABLE history");
    }

    logMessage(norbert:Norbert, event: string, from:string, to:string, message:string) {
        this.stmt.run([to, from, message, new Date().getTime(), event], err => {
            if(err) {
                norbert.client.say(to, "error oh noes");
                console.error(err);
            } else {
                this.addToRecent(event, {to, from, message});
            }
        });
    }

    addToRecent(type:string, message:{to:string, from:string, message: string}) {
        if(!this.recent.hasOwnProperty(message.to)) {
            this.recent[message.to] = {};
        }

        if(!this.recent[message.to].hasOwnProperty(type)) {
            this.recent[message.to][type] = [];
        }

        this.recent[message.to][type].unshift(message);

        if(this.recent[message.to][type].length > 5) {
            this.recent[message.to][type].pop();
        }
    }
}