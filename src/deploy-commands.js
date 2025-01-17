#!/usr/bin/env node

const fs = require('node:fs');
const {REST} = require('@discordjs/rest');
const {Routes} = require('discord-api-types/v9');
const {clientId, token} = require('./helpers/env');

const commands = [];
const commandFiles = fs.readdirSync(__dirname + '/commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`${__dirname}/commands/${file}`);
    commands.push(command.data.toJSON());
}

const rest = new REST({version: '9'}).setToken(token);

rest.put(Routes.applicationCommands(clientId), {body: commands})
    .then(() => console.log('Successfully registered application commands.'))
    .catch(console.error);
