require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const http = require('http');
const { handleError } = require('./utils/errorHandler');
const db = require('./utils/db'); 

// 💡 추가됨: 작성해주신 interactionCreate.js 파일을 불러옵니다.
// (주의: 파일이 있는 실제 경로에 맞게 './utils/interactionCreate' 등 경로를 수정해 주세요!)
const interactionHandler = require('./events/interactionCreate'); 

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const PORT = process.env.PORT || 3000;

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
    
    // 💡 [수정됨] 범인이었던 무조건 return 하는 코드를 지우고, 가입 검증을 맨 위로 올렸습니다.
    // 버튼이나 드롭다운은 commandName이 없으므로, undefined 처리하여 안전하게 검증합니다.
    const commandName = interaction.commandName || ''; 

    // 💡 [가입 제한 시스템] 가입 및 핑 명령어가 아니면 DB 등록 여부 무조건 검사 (버튼, 미니게임 포함)
    if (commandName !== '가입' && commandName !== '핑') {
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
            return handleError(error, '상호작용 전 가입 여부 검증 중 오류 발생', interaction);
        }
    }

    // 1️⃣ 슬래시 명령어일 때의 처리
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            handleError(error, `명령어 실행 중 오류 발생 (/${interaction.commandName})`, interaction);
        }
    }
    // 2️⃣ 드롭다운, 버튼, 모달창일 때의 처리 (interactionCreate.js로 전달)
    else if (interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) {
        try {
            await interactionHandler.handleInteraction(interaction);
        } catch (error) {
            handleError(error, '미니게임 상호작용 처리 중 오류 발생', interaction);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Ceylon Bot is Online!');
}).listen(PORT, () => {
    console.log(`[시스템] 서버 유지를 위한 웹서버가 ${PORT} 포트에서 돌아가는 중입니다.`);
});