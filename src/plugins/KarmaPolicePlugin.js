// @flow

import SimpleChanDaemonPlugin from 'plugins/SimpleChanDaemonPlugin';
import Norbert from 'lib/Norbert';

export default class KarmaPolicePlugin extends SimpleChanDaemonPlugin {
    getHelp() {
        return {
            overview: "Karma Police, protect this channel.",
            commands: {}
        };
    }

    getName() {
        return "KarmaPolice";
    }

    getTriggers():[ (word:string) => false|(channel:string, sender:string, message:string, client:Norbert,
        triggered:string)=>void] {
        return [
            this.isKarmaIncrement,
            this.isKarmaDecrement
        ];
    }

    init(norbert:Norbert) {
        super.init(norbert);
        norbert.db.run("CREATE TABLE IF NOT EXISTS karma (name TEXT PRIMARY KEY, channel TEXT, score INTEGER)");
    }

    reset(norbert:Norbert) {
        norbert.db.run("TRUNCATE TABLE karma");
    }

    isKarmaIncrement(word:string) {
        return word.endsWith('++') ?
               this.incrementKarma : false;
    }

    isKarmaDecrement(word:string) {
        return word.endsWith('--') ?
               this.decrementKarma : false;
    }

    incrementKarma(channel:string, sender:string, message:string, norbert:Norbert, triggered:string) {
        triggered = triggered.replace(/[\+\-]+/, '');

        let stmt = norbert.db.prepare("INSERT OR REPLACE INTO karma (name, channel, score) " +
            "VALUES (?, ?, COALESCE((SELECT score from karma WHERE name=? and channel=?),0) + 1)");

        stmt.run([triggered, channel, triggered, channel], err => {
            if(err) {
                norbert.client.say(channel, "error oh noes");
            }
        });
    }

    decrementKarma(channel:string, sender:string, message:string, norbert:Norbert, triggered:string) {
        triggered = triggered.replace(/[\+\-]+/, '');

        let stmt = norbert.db.prepare("INSERT OR REPLACE INTO karma (name, channel, score) " +
            "VALUES (?, ?, COALESCE((SELECT score from karma WHERE name=? and channel=?),0) - 1)");

        stmt.run([triggered, channel, triggered, channel], err => {
            if(err) {
                norbert.client.say(channel, "error oh noes");
            }
        });
    }
}