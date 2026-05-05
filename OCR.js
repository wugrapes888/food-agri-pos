// ============================================================
// 團購發貨系統 - Gemini Vision OCR 解析
// 需在 Script Properties 設定 GEMINI_API_KEY
// ============================================================

const OCR = (() => {
  const MODEL = 'gemini-2.5-flash';

  function getApiKey() {
    return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')
      || 'AIzaSyChXpE3FYQdMgwy4x3eabMla1sNaGF_Si0';
  }

  function parseImage(base64Image) {
    const apiKey = getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const prompt = `你是一個台灣團購訂單辨識助手。請仔細分析這張截圖（可能來自 LINE 記事本、群組截圖、表格截圖或手寫），做兩件事：

【任務一：辨識商品結構】
- 找出這次開團的所有商品
- 若同一類商品有多種口味/規格，請將它們歸在同一個群組下
- 例如：「溫家韭菜水餃」和「溫家高麗菜水餃」→ 群組名稱「溫家水餃」，兩個規格
- 若只有一種商品且沒有規格差異，variants 填空陣列

【任務二：辨識每筆訂單】
- 客人姓名：只保留真正的人名，去除「代訂：」「訂購人」「被標註者」等說明文字、逗號後的備註
- 數量：若格式為「姓名,數量,...」，第二欄是數量；若用 x/×/＋ 標示，取其後的數字；未標示預設 1
- 商品：對應到任務一辨識出的規格名稱
- 忽略詢問留言、系統訊息

【回傳格式】只回傳 JSON，不要任何說明文字：
{
  "suggestedProducts": [
    {
      "groupName": "群組顯示名稱（如無分組則同商品名）",
      "singlePrice": 價格數字或null,
      "variants": [
        { "name": "規格完整名稱", "price": 價格數字 }
      ]
    }
  ],
  "orders": [
    { "customer": "客人姓名", "product": "規格完整名稱（對應variants裡的name）", "qty": 數量, "price": 單價 }
  ],
  "summary": "共幾位客人、幾種規格"
}`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const raw = response.getContentText();
    const result = JSON.parse(raw);

    if (result.error) {
      throw new Error(`Gemini API 錯誤：${result.error.message}`);
    }

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI 未回傳任何內容，請確認圖片清晰度');

    // 處理可能包在 markdown code block 裡的 JSON
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('AI 回傳格式無法解析，請重試或手動輸入');
    }
  }

  function parseText(text) {
    const apiKey = getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const prompt = `你是一個台灣團購訂單助手。請將以下整理好的訂單文字，轉換成結構化的訂單資料。

文字格式可能多樣，例如：
- "小明：草莓冰淇淋 x2、巨峰葡萄 x1"
- "小美 草莓蛋糕2個 巧克力蛋糕1個"
- "【王大明】冰淇淋組合×3"
等各種變體。

請以 JSON 格式回傳，只回傳 JSON 不要任何說明：
{
  "orders": [
    { "customer": "客人姓名", "product": "商品完整名稱", "qty": 數量 }
  ],
  "summary": "共幾位客人、幾筆訂單"
}

訂單文字如下：
${text}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };

    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    if (result.error) throw new Error(`Gemini API 錯誤：${result.error.message}`);

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('無法解析回傳格式，請重試');
    }
  }

  return { parseImage, parseText };
})();
