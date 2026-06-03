const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../utils/db');
const { handleError } = require('../utils/errorHandler');

// 아이템 정보 정의
const ITEM_META = {
    'item_ticket_fee': { name: '거래 수수료 1회 면제권', emoji: '🎫', desc: '다음 주식 매도 시 수수료를 100% 면제합니다.' },
    'item_info_insider': { name: '은밀한 찌라시 (내부자 정보)', emoji: '🕵️', desc: '다음에 터질 뉴스를 미리 은밀하게 훔쳐봅니다.' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('인벤토리')
        .setDescription('🎒 보유 중인 아이템을 확인하고 사용합니다.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            // 1. DB에서 아이템 목록 가져오기
            const result = await db.query(
                'SELECT item_id, quantity FROM user_inventory WHERE user_id = $1 AND guild_id = $2 AND quantity > 0',
                [userId, guildId]
            );

            const inventoryEmbed = new EmbedBuilder()
                .setTitle(`🎒 ${interaction.user.username}님의 인벤토리`)
                .setColor('#2B2D31')
                .setThumbnail(interaction.user.displayAvatarURL());

            // 아이템이 하나도 없을 때 처리
            if (result.rows.length === 0) {
                inventoryEmbed.setDescription('보유 중인 아이템이 없습니다.\n서포트 서버의 `/상점`에서 아이템을 구매해 보세요!');
                return await interaction.reply({ embeds: [inventoryEmbed] });
            }

            // 2. 인벤토리 목록 텍스트 빌드 및 드롭다운 옵션 생성
            let itemListText = '';
            const menuOptions = [];

            for (const row of result.rows) {
                const meta = ITEM_META[row.item_id] || { name: '알 수 없는 아이템', emoji: '❓', desc: '설명이 없습니다.' };
                itemListText += `${meta.emoji} **${meta.name}** : \`${row.quantity}개\`\n└ *${meta.desc}*\n\n`;
                
                menuOptions.push({
                    label: meta.name,
                    description: `${row.quantity}개 보유 중`,
                    value: row.item_id,
                    emoji: meta.emoji
                });
            }
            inventoryEmbed.setDescription(itemListText);

            // 3. 컴포넌트 생성 (드롭다운 & 비활성화된 사용 버튼)
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('inv_select')
                .setPlaceholder('사용할 아이템을 선택하세요...')
                .addOptions(menuOptions);

            const useButton = new ButtonBuilder()
                .setCustomId('inv_use_btn')
                .setLabel('사용하기')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true); // 처음엔 아이템을 안 골랐으니 비활성화

            const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
            const rowBtn = new ActionRowBuilder().addComponents(useButton);

            // 메시지 전송
            const response = await interaction.reply({
                embeds: [inventoryEmbed],
                components: [rowMenu, rowBtn]
            });

            // 4. 컴포넌트 조작을 감지할 수집기(Collector) 오픈 (유효시간 1분)
            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000
            });

            let selectedItemId = null; // 유저가 드롭다운에서 선택한 아이템 ID 저장용 변수

            collector.on('collect', async (i) => {
                // [경우 A] 드롭다운을 골랐을 때
                if (i.customId === 'inv_select') {
                    selectedItemId = i.values[0];
                    
                    // 버튼을 활성화 상태로 변경하여 다시 렌더링
                    useButton.setDisabled(false);
                    await i.update({ components: [rowMenu, rowBtn] });
                }
                
                // [경우 B] 사용하기 버튼을 눌렀을 때
                else if (i.customId === 'inv_use_btn') {
                    if (!selectedItemId) return;
                    await i.deferReply({ ephemeral: true });

                    // 한 번 더 개수 확인 (그 사이에 썼을 수도 있으니 검증)
                    const checkInv = await db.query(
                        'SELECT quantity FROM user_inventory WHERE user_id = $1 AND guild_id = $2 AND item_id = $3 AND quantity > 0',
                        [userId, guildId, selectedItemId]
                    );

                    if (checkInv.rows.length === 0) {
                        return await i.editReply({ content: '❌ 보유하고 있지 않거나 이미 다 소모한 아이템입니다.' });
                    }

                    // DB에서 아이템 1개 차감
                    await db.query(
                        'UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND guild_id = $2 AND item_id = $3',
                        [userId, guildId, selectedItemId]
                    );

                    // 💥 아이템별 진짜 효과 연동 부분!
                    const targetMeta = ITEM_META[selectedItemId];
                    let effectMessage = '';

                    if (selectedItemId === 'item_ticket_fee') {
                        effectMessage = `🎫 **수수료 면제권**이 사용되었습니다!\n다음 주식 매도 시 수수료가 자동으로 전액 면제됩니다.`;
                        // 팁: 나중에 매도 로직(sell.js)에서 이 버프가 켜져있는지 체크하는 컬럼을 users 테이블에 넣거나, 
                        // 매도 시점에 인벤토리를 직접 까는 자동 방식으로 놔둬도 됨. (유저가 원할 때 쓰게 하려면 버프 플래그 활성화 추천)
                    } 
                    else if (selectedItemId === 'item_info_insider') {
                        // 💡 다음날 뉴스 테이블이나 스케줄러 큐에서 다음 종목 호재 정보를 긁어오는 쿼리 영역
                        effectMessage = `🕵️ **은밀한 찌라시 개봉 결과**\n\n**[익명의 주식 브로커]:** "어이, 내일 주식 변동 타임에 어떤 기업이 대형 사고 하나 제대로 칠 것 같더라고... 내 전재산 다 걸었으니 형씨도 준비해둬."`;
                    }

                    await i.editReply({ content: `✅ 아이템 사용 성공!\n\n${effectMessage}` });
                    
                    // 사용이 끝났으므로 인벤토리 창 닫기 및 수집기 종료
                    collector.stop();
                }
            });

            // 시간 초과되거나 종료되면 컴포넌트들을 전부 만료(disabled) 처리해서 박제
            collector.on('end', async () => {
                try {
                    selectMenu.setDisabled(true);
                    useButton.setDisabled(true);
                    await interaction.editReply({ components: [rowMenu, rowBtn] });
                } catch (e) {
                    // 메시지가 이미 지워졌을 때의 예외 처리
                }
            });

        } catch (error) {
            return handleError(error, '인벤토리 컴포넌트 명령어 실행 중 오류 발생', interaction);
        }
    }
};