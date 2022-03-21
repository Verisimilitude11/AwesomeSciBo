import { SlashCommandBuilder } from '@discordjs/builders';
import { MessageEmbed, MessageActionRow, MessageButton } from 'discord.js';

import { decode } from 'html-entities';
import axios from 'axios';

import userScore from '../models/userScore';

import log from '../helpers/log.js';
import { updateScore } from '../helpers/db.js';

export const data = new SlashCommandBuilder()
	.setName('train')
	.setDescription('Sends a training question to be answered')
	.addStringOption(option => {
		option
			.setName('subject')
			.setDescription('Optional subject to be used as a filter')
			.setRequired(false)
			.addChoice('astro', 'astro')
			.addChoice('bio', 'bio')
			.addChoice('ess', 'ess')
			.addChoice('chem', 'chem')
			.addChoice('phys', 'phys')
			.addChoice('math', 'math')
			.addChoice('energy', 'energy')
			.setRequired(false);
		return option;
	});

export async function execute(interaction) {
	await interaction.deferReply();

	const subject = interaction.options.get('subject') ? interaction.options.get('subject').value : null;
	const authorId = interaction.user.id;
	let score;
	userScore
		.findOne({ authorID: authorId })
		.lean()
		.then((obj, err) => {
			if (!obj) {
				score = 0;
			}
			else if (obj) {
				score = obj.score;
			}
			else {
				log({ logger: 'train', content: `Getting user score failed: ${err}`, level: 'error' });
			}
		});

	let categoryArray : string[] = [];

	switch (subject) {
	case null:
		categoryArray = ['BIOLOGY', 'PHYSICS', 'CHEMISTRY', 'EARTH AND SPACE', 'ASTRONOMY', 'MATH'];
		break;
	case 'astro':
	case 'astronomy':
		categoryArray = ['ASTRONOMY'];
		break;
	case 'bio':
	case 'biology':
		categoryArray = ['BIOLOGY'];
		break;
	case 'ess':
	case 'earth science':
	case 'es':
		categoryArray = ['EARTH SCIENCE'];
		break;
	case 'chem':
	case 'chemistry':
		categoryArray = ['CHEMISTRY'];
		break;
	case 'phys':
	case 'physics':
		categoryArray = ['PHYSICS'];
		break;
	case 'math':
		categoryArray = ['MATH'];
		break;
	case 'energy':
		categoryArray = ['ENERGY'];
		break;
	default:
		interaction.followUp(
			new MessageEmbed()
				.setDescription('<:red_x:816791117671825409> Not a valid subject!')
				.setColor('#ffffff'),
		);
		return;
	}

	axios
		.post('https://scibowldb.com/api/questions/random', { categories: categoryArray })
		.then((res) => {
			const questionData = res.data.question;
			const tossupQuestion = questionData.tossup_question;
			const tossupAnswer = questionData.tossup_answer;
			const tossupFormat = questionData.tossup_format;
			let answers = tossupAnswer.split(' (ACCEPT: ');
			if (answers.length > 1) {
				answers[1] = answers[1].slice(0, answers[1].length - 1); // If there are multiple elements, it means there was an 'accept' and therefore a trailing ')' which should be removed
				answers = [answers[0], ...answers[1].split(new RegExp(' OR ', 'i'))]; // Use the first element plus the last element split by 'OR' case insensitive
			}
			interaction.followUp({ content: decode(tossupQuestion), fetchMessage: true })
				.then(questionMessage => {
					const sourceButton = new MessageActionRow()
						.addComponents(
							new MessageButton()
								.setURL(questionData.uri)
								.setLabel('Source')
								.setStyle('LINK'),
						);
					switch (tossupFormat) {
					case 'Short Answer': {
						// eslint-disable-next-line no-case-declarations
						const messageFilter = m => m.author.id === interaction.user.id || m.author.id === interaction.client.user.id;
						interaction.channel.awaitMessages({
							filter: messageFilter,
							max: 1,
						})
							.then(collected => {
								const answerMsg = collected.first();

								if (answerMsg.author.id === interaction.client.user.id) return;

								let predicted = '';
								if (answerMsg.content.toLowerCase() === tossupAnswer.toLowerCase() || answers.includes(answerMsg.content.toUpperCase())) {
									predicted = 'correct';
								}
								else {
									predicted = 'incorrect';
								}

								if (predicted === 'correct') {
									updateScore(true, score, authorId).then((msgToReply) =>
										answerMsg.reply(msgToReply),
									);
								}
								else {
									const overrideEmbed = new MessageEmbed()
										.setAuthor({ name: answerMsg.author.tag, iconURL: answerMsg.author.displayAvatarURL() })
										.addField('Correct answer', `\`${tossupAnswer}\``)
										.setDescription('It seems your answer was incorrect. Please react with <:override:955265585086857236> to override your answer if you think you got it right.')
										.setColor('#ffffff')
										.setTimestamp();
									answerMsg.channel.send({
										embeds: [overrideEmbed],
									})
										.then(overrideMsg => {
											overrideMsg.react('<:override:955265585086857236>');
											const filter = (reaction, user) => {
												return (
													['override'].includes(reaction.emoji.name) &&
                  user.id === answerMsg.author.id
												);
											};
											overrideMsg
												.awaitReactions({
													filter: filter,
													max: 1,
												})
												.then(() => {
													updateScore(true, score, authorId).then((msgToReply) =>
														answerMsg.reply(msgToReply),
													);
												}).catch(err => log({ logger: 'train', content: `Failed to override score: ${err}`, level: 'error' }));
										}).catch(err => log({ logger: 'train', content: `Failed to send override message: ${err}`, level: 'error' }));
								}
								interaction.editReply({ components: [sourceButton] });
							}).catch(err => log({ logger: 'train', content: `${err}`, level: 'error' }));
						break;
					}
					case 'Multiple Choice': {
						const choices = new MessageActionRow()
							.addComponents(
								new MessageButton()
									.setCustomId('w')
									.setLabel('W')
									.setStyle('SECONDARY'),
								new MessageButton()
									.setCustomId('x')
									.setLabel('X')
									.setStyle('SECONDARY'),
								new MessageButton()
									.setCustomId('y')
									.setLabel('Y')
									.setStyle('SECONDARY'),
								new MessageButton()
									.setCustomId('z')
									.setLabel('Z')
									.setStyle('SECONDARY'),
							);
						interaction.editReply({ components: [choices] });
						const mcFilter = i => ['w', 'x', 'y', 'z'].includes(i.customId) && i.user.id === interaction.user.id;
						questionMessage.awaitMessageComponent({ filter: mcFilter })
							.then(mcChoice => {
								if (tossupAnswer.charAt(0).toLowerCase() === mcChoice.customId) {
									updateScore(true, score, authorId).then((msgToReply) =>
										mcChoice.reply(msgToReply),
									);
								}
								else {
									const incorrectEmbed = new MessageEmbed()
										.setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
										.addField('Correct answer', `\`${tossupAnswer}\``)
										.setDescription(`It seems your answer ${mcChoice.customId.toUpperCase()} was incorrect.`)
										.setColor('#ffffff')
										.setTimestamp();
									mcChoice.reply({ embeds: [incorrectEmbed] });
								}
								interaction.editReply({ components: [sourceButton] });
							});
						break;
					}
					}
				}).catch(err => log({ logger: 'train', content: `${err}`, level: 'error' }));
		}).catch(err => log({ logger: 'train', content: `${err}`, level: 'error' }));
}