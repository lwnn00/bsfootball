// 大小盘推荐API
module.exports = async (req, res) => {
  // 设置CORS头（同asian.js）
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: '只支持POST请求' 
    });
  }

  try {
    const data = req.body;
    
    // 验证必需字段
    const requiredFields = [
      'initialHandicap', 
      'currentHandicap', 
      'initialWater', 
      'currentWater', 
      'historicalRecord'
    ];
    
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        return res.status(400).json({ 
          success: false, 
          error: `缺少必要字段: ${field}` 
        });
      }
    }

    // 解析数据
    const initialHandicap = parseFloat(data.initialHandicap);
    const currentHandicap = parseFloat(data.currentHandicap);
    const initialWater = parseFloat(data.initialWater);
    const currentWater = parseFloat(data.currentWater);
    const historicalRecord = data.historicalRecord;

    // 验证数据格式
    if (isNaN(initialHandicap) || isNaN(currentHandicap) || 
        isNaN(initialWater) || isNaN(currentWater)) {
      return res.status(400).json({ 
        success: false, 
        error: '数值格式错误' 
      });
    }

    if (!['win', 'loss'].includes(historicalRecord)) {
      return res.status(400).json({ 
        success: false, 
        error: '历史战绩必须是win或loss' 
      });
    }

    // 计算盘口和水位变化
    const handicapChange = currentHandicap - initialHandicap;
    const waterChange = currentWater - initialWater;

    // 确定盘口变化方向
    const handicapUp = handicapChange > 0;
    const handicapDown = handicapChange < 0;

    // 确定水位变化方向
    const waterUp = waterChange > 0;
    const waterDown = waterChange < 0;

    let recommendation = "";
    let details = "";

    // 推荐规则（服务器端计算，客户端不可见）
    // 规则1: 盘口升，水位升，历史战绩赢 -> 小球
    if (handicapUp && waterUp && historicalRecord === "win") {
      recommendation = "小球";
    }
    // 规则2: 盘口升，水位升，历史战绩输 -> 大球
    else if (handicapUp && waterUp && historicalRecord === "loss") {
      recommendation = "大球";
    }
    // 规则3: 盘口降，水位升，历史战绩输 -> 小球
    else if (handicapDown && waterUp && historicalRecord === "loss") {
      recommendation = "小球";
    }
    // 规则4: 盘口降，水位升，历史战绩赢 -> 大球
    else if (handicapDown && waterUp && historicalRecord === "win") {
      recommendation = "大球";
    }
    // 规则5: 盘口升，水位降，历史战绩输 -> 小球
    else if (handicapUp && waterDown && historicalRecord === "loss") {
      recommendation = "小球";
    }
    // 规则6: 盘口升，水位降，历史战绩赢 -> 大球
    else if (handicapUp && waterDown && historicalRecord === "win") {
      recommendation = "大球";
    }
    // 规则7: 盘口降，水位降，历史战绩输 -> 大球
    else if (handicapDown && waterDown && historicalRecord === "loss") {
      recommendation = "大球";
    }
    // 规则8: 盘口降，水位降，历史战绩赢 -> 小球
    else if (handicapDown && waterDown && historicalRecord === "win") {
      recommendation = "小球";
    } else {
      // 如果没有匹配的规则（例如盘口或水位无变化）
      recommendation = "无明确推荐";
    }

    // 构建详细说明
    const handicapChangeText = handicapChange > 0 ? `大小盘上升 ${Math.abs(handicapChange)}` :
      handicapChange < 0 ? `大小盘下降 ${Math.abs(handicapChange)}` : "大小盘无变化";
    const waterChangeText = waterChange > 0 ? `水位上升 ${Math.abs(waterChange.toFixed(2))}` :
      waterChange < 0 ? `水位下降 ${Math.abs(waterChange.toFixed(2))}` : "水位无变化";
    const historicalText = historicalRecord === "win" ? "历史战绩: 赢" : "历史战绩: 输";

    details = `${handicapChangeText} | ${waterChangeText} | ${historicalText}`;

    // 记录到数据库（可选）
    await logRecommendationToDB({
      matchName: data.matchName || '未命名赛事',
      handicapType: 'size',
      initialHandicap,
      currentHandicap,
      initialWater,
      currentWater,
      historicalRecord,
      recommendation,
      details,
      timestamp: data.timestamp || new Date().toISOString(),
      clientInfo: req.headers['user-agent'] || '未知客户端'
    });

    res.status(200).json({
      success: true,
      recommendation,
      details,
      analysis: {
        handicapChange,
        waterChange,
        handicapUp,
        waterUp,
        handicapDown,
        waterDown,
        historicalRecord
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('推荐计算错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器内部错误',
      message: error.message 
    });
  }
};

// 记录推荐到数据库
async function logRecommendationToDB(data) {
  try {
    // 这里可以连接Neon数据库进行记录
    // 暂时先记录到控制台
    console.log('推荐记录:', {
      type: 'size',
      ...data,
      loggedAt: new Date().toISOString()
    });
    
    // 实际使用时，可以取消注释以下代码来连接Neon数据库
    /*
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    const query = `
      INSERT INTO recommendations 
      (match_name, handicap_type, initial_handicap, current_handicap, 
       initial_water, current_water, historical_record, recommendation, 
       details, created_at, client_info)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    
    await pool.query(query, [
      data.matchName,
      data.handicapType,
      data.initialHandicap,
      data.currentHandicap,
      data.initialWater,
      data.currentWater,
      data.historicalRecord,
      data.recommendation,
      data.details,
      new Date(data.timestamp),
      data.clientInfo
    ]);
    
    await pool.end();
    */
    
  } catch (error) {
    console.error('数据库记录错误:', error);
    // 不抛出错误，避免影响主流程
  }
}
