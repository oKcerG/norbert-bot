// @flow

import SimpleChanMsgPlugin from 'plugins/SimpleChanMsgPlugin';
import LFM from 'lastfmapi';
import Norbert from 'lib/Norbert';

export default class LastFmPlugin extends SimpleChanMsgPlugin {
    lfm:LFM;

    constructor(apiKey, secret) {
        super();
        this.lfm = new LFM({api_key: apiKey, secret: secret});
        this.templates = {
            'np': "%user% is currently listening to %title% by %artist%.",
            'not_np': '%user% is currently not listening to anything.'
        }
    }

    init(norbert:Norbert) {
        norbert.db.run("CREATE TABLE IF NOT EXISTS lastfm (name TEXT PRIMARY KEY, lastfm TEXT)");
    }

    reset(norbert:Norbert) {
        norbert.db.run("TRUNCATE TABLE lastfm");
    }

    getTrigger() {
        return "!";
    }

    getChannels() {
        return [];
    }

    getCommands() {
        return {
            'np': ::this.nowPlaying,
            'save': ::this.saveUser,
            'myLastFm': ::this.lookupUser
        }
    }

    lookupUser(channel, sender, message, norbert) {
        let stmt = norbert.db.prepare("SELECT * FROM lastfm WHERE name=(?)");
        stmt.all([sender], (err, rows) => {
            if(rows.length > 0) {
                norbert.client.say(channel, `${sender}, I know you as ${rows[0].lastfm}`);
            } else {
                norbert.client.say(channel, `${sender}, I don't know you.`);
            }
        });
    }

    saveUser(channel, sender, message, norbert) {
        let user = sender;
        let lastFm = message;

        let stmt = norbert.db.prepare("INSERT OR REPLACE INTO lastfm (name, lastfm) VALUES (?, ?)");
        stmt.run([user, lastFm], (err) => {
            if(err) {
                norbert.client.say(channel, "error oh noes");
            } else {
                norbert.client.say(channel, `${sender}, I will now remember you as ${lastFm}`);
            }
        });
    }

    nowPlaying(channel, sender, message, norbert) {
        let user;
        let client = norbert.client;

        if(message.trim() != "") {
            user = message.split(/\s+/)[0];
        } else {
            user = sender;
        }

        let stmt = norbert.db.prepare("SELECT * FROM lastfm WHERE name=(?)");
        stmt.all([user], (err, rows) => {

            let lastFmName = "";

            if(rows.length > 0) {
                lastFmName = rows[0].lastfm;
            } else {
                lastFmName = user;
            }

            this.lfm['user'].getRecentTracks({limit: 1, user: lastFmName}, ((err, recent) => {
                let info;

                if(recent &&
                    recent.hasOwnProperty('track') &&
                    recent.track.length > 0 &&
                    recent.track[0].hasOwnProperty('@attr') &&
                    recent.track[0]['@attr'].hasOwnProperty('nowplaying') &&
                    recent.track[0]['@attr']['nowplaying'] == 'true'
                ) {
                    let meta = this.gatherMetaData(recent.track[0]);
                    meta.user = lastFmName;
                    info = this.processTemplate(this.templates.np, meta);
                } else {
                    info = this.processTemplate(this.templates.not_np, {user});
                }

                client.say(channel, info);
            }).bind(this));
        });
    }

    gatherMetaData(track) {
        let artist = track.hasOwnProperty('artist') &&
            track['artist'].hasOwnProperty('#text') ?
            track['artist']['#text'] : '';
        let title = track.hasOwnProperty('name') ? track['name'] : '';
        let album = track.hasOwnProperty('album') &&
            track['album'].hasOwnProperty('#text') ?
            track['album']['#text'] : '';
        let date = track.hasOwnProperty('date') &&
            track['date'].hasOwnProperty('#uts') ?
            new Date(track['date']['uts'] * 1000) : '';

        return {artist, title, album, date};
    }

    processTemplate(template, meta) {
        for(let key in meta) {
            template = template.replace(new RegExp(`%${key}%`, 'g'), meta[key]);
        }

        return template;
    }
}