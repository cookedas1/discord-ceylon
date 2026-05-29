require('dotenv').config();
const { Pool } = require('pg');
const { handleError } = require('./errorHandler');

// 💡 Supabase 클라우드 연동을 위해 단일 ConnectionString(DATABASE_URL) 및 SSL 보안 설정을 적용합니다.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Render와 Supabase 간의 안전한 암호화 통신 필수 설정
    }
});

const TICK_INTERVAL = 30000; // 💡 30초 주기

// 30초마다 주가를 변동시키는 함수
async function updateStockPrices() {
    try {
        const res = await pool.query('SELECT ticker, price FROM stocks');
        for (const row of res.rows) {
            const changePercent = (Math.random() * 3 - 1.5) / 100; 
            let newPrice = Math.round(row.price * (1 + changePercent));
            if (newPrice < 100) newPrice = 100; // 동전주 방지

            await pool.query('UPDATE stocks SET price = $1 WHERE ticker = $2', [newPrice, row.ticker]);
        }
        console.log(`[📈 DB 시장 변동] 주가가 데이터베이스에 갱신되었습니다. (${TICK_INTERVAL / 1000}초 주기)`);
    } catch (error) {
        handleError(error, 'DB 주가 변동 업데이트 중 오류 발생');
    }
}

setInterval(updateStockPrices, TICK_INTERVAL);
console.log('✅ Supabase PostgreSQL 데이터베이스 연결 및 주가 변동 타이머(30초) 가동 완료!');

module.exports = {

    // 💡 랭킹 조회를 위해 모든 유저의 자산 및 주식 데이터 가져오기
    getLeaderboardData: async (guildId) => {
        try {
            // 해당 서버(guild)의 모든 유저 정보
            const users = await pool.query('SELECT user_id, cash FROM users WHERE guild_id = $1', [guildId]);
            // 해당 서버의 모든 주식 보유 정보
            const holdings = await pool.query('SELECT user_id, stock_name, quantity FROM holdings WHERE guild_id = $1', [guildId]);
            
            return { users: users.rows, holdings: holdings.rows };
        } catch (error) {
            handleError(error, 'getLeaderboardData 쿼리 중 오류');
            return null;
        }
    },

    // 💡 유저 탈퇴 처리 (보유 주식 삭제 -> 유저 정보 삭제 -> 탈퇴 기록 추가)
    withdrawUser: async (userId, guildId) => {
        try {
            // 트랜잭션 대신 순차 안전 삭제 및 삽입
            await pool.query('DELETE FROM holdings WHERE user_id = $1 AND guild_id = $2', [userId, guildId]);
            await pool.query('DELETE FROM users WHERE user_id = $1 AND guild_id = $2', [userId, guildId]);
            
            // 기존 탈퇴 기록이 있다면 갱신, 없으면 삽입
            await pool.query(`
                INSERT INTO withdrawals (user_id, guild_id, withdrawn_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, guild_id) 
                DO UPDATE SET withdrawn_at = CURRENT_TIMESTAMP
            `, [userId, guildId]);
            
            return true;
        } catch (error) {
            handleError(error, 'withdrawUser 쿼리 중 오류');
            return false;
        }
    },

    // 💡 재가입 가능 여부 체크 (2일 쿨타임 검증)
    checkWithdrawalCooldown: async (userId, guildId) => {
        try {
            const res = await pool.query(
                'SELECT withdrawn_at FROM withdrawals WHERE user_id = $1 AND guild_id = $2',
                [userId, guildId]
            );
            
            if (res.rows.length === 0) return { canJoin: true };

            const withdrawnAt = new Date(res.rows[0].withdrawn_at);
            const now = new Date();
            
            // 시간 차이 계산 (밀리초 -> 시간)
            const diffTime = now - withdrawnAt;
            const diffHours = diffTime / (1000 * 60 * 60);
            
            // 2일(48시간)이 지났는지 확인
            if (diffHours >= 48) {
                // 쿨타임이 지났으므로 탈퇴 기록 삭제 후 가입 허용
                await pool.query('DELETE FROM withdrawals WHERE user_id = $1 AND guild_id = $2', [userId, guildId]);
                return { canJoin: true };
            } else {
                // 남은 시간 계산 (시간 단위)
                const remainingHours = Math.ceil(48 - diffHours);
                return { canJoin: false, remainingHours };
            }
        } catch (error) {
            handleError(error, 'checkWithdrawalCooldown 쿼리 중 오류');
            return { canJoin: false, remainingHours: 48 }; // 오류 시 안전하게 차단
        }
    },
    getStock: async (ticker) => {
        try {
            const res = await pool.query('SELECT * FROM stocks WHERE UPPER(ticker) = $1', [ticker.toUpperCase()]);
            return res.rows[0] || null;
        } catch (error) {
            handleError(error, 'getStock 쿼리 중 오류');
            return null;
        }
    },
    getAllStocks: async () => {
        try {
            const res = await pool.query('SELECT * FROM stocks');
            const stockMap = {};
            res.rows.forEach(row => {
                stockMap[row.ticker] = { name: row.name, price: row.price };
            });
            return stockMap;
        } catch (error) {
            handleError(error, 'getAllStocks 쿼리 중 오류');
            return {};
        }
    },
    checkUser: async (userId, guildId) => {
        try {
            const res = await pool.query('SELECT * FROM users WHERE user_id = $1 AND guild_id = $2', [userId, guildId]);
            return res.rows[0] || null;
        } catch (error) {
            handleError(error, 'checkUser 쿼리 중 오류');
            return null;
        }
    },
    registerUser: async (userId, guildId) => {
        try {
            await pool.query('INSERT INTO users (user_id, guild_id) VALUES ($1, $2)', [userId, guildId]);
            return true;
        } catch (error) {
            handleError(error, 'registerUser 쿼리 중 오류');
            return false;
        }
    },
    query: (text, params) => pool.query(text, params) // 일반 쿼리 실행용 오픈
};