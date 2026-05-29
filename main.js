require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { handleError } = require('./utils/errorHandler');
const db = require('./utils/db'); // DB 모듈 불러오기

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsJson = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsJson.push(command.data.toJSON());
    }
}

client.once('ready', async () => {
    console.log(`🤖 실론(Ceylon) 가동 시작: ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 글로벌 슬래시 명령어 등록 중...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandsJson },
        );
        console.log('✅ 글로벌 슬래시 명령어 등록 완료!');
    } catch (error) {
        handleError(error, '슬래시 명령어 등록 중 오류 발생');
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // 💡 [가입 제한 시스템] 가입 및 핑 명령어가 아니면 DB 등록 여부 검사
    if (interaction.commandName !== '가입' && interaction.commandName !== '핑') {
        try {
            const isUser = await db.checkUser(interaction.user.id, interaction.guildId);
            
            // 데이터베이스에 유저 정보가 없으면 실행 차단
            if (!isUser) {
                return await interaction.reply({
                    content: '❌ 실론 모의주식 서비스를 이용하시려면 먼저 `/가입` 명령어를 입력해 약관에 동의하셔야 합니다!',
                    ephemeral: true
                });
            }
        } catch (error) {
            return handleError(error, '명령어 실행 전 가입 여부 검증 중 오류 발생', interaction);
        }
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        handleError(error, `명령어 실행 중 오류 발생 (/${interaction.commandName})`, interaction);
    }
});

client.login(process.env.DISCORD_TOKEN);