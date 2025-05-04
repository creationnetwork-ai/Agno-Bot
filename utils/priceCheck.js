// utils/priceCheck.js

const fetch = require('node-fetch');
const memory = require('../memory');
const { triggerStopLoss } = require('../bot'); // Bu fonksiyon bot.js içinde tanımlanmalı
require('dotenv').config();

const CHECK_INTERVAL = 1000; // 1 saniyede bir kontrol

async function getCurrentPrice(mint) {
  try {
    const res = await fetch(`${process.env.METIS_ENDPOINT}/price?mint=${mint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return parseFloat(data.price || 0);
  } catch (error) {
    console.error(`Fiyat alınamadı (${mint}):`, error.message);
    return null;
  }
}

async function checkAllTokens() {
  const tokens = memory.getTokens();
  for (const mint in tokens) {
    const buyPrice = tokens[mint].buyPrice;
    const currentPrice = await getCurrentPrice(mint);

    if (currentPrice === null) continue;

    const threshold = buyPrice * 0.87;
    if (currentPrice < threshold) {
      console.log(`⚠️ STOP/LOSS: ${mint} alış fiyatı ${buyPrice} > mevcut fiyat ${currentPrice}`);
      try {
        await triggerStopLoss(mint);
        memory.removeToken(mint);
      } catch (e) {
        console.error(`Stop-loss uygulanamadı (${mint}):`, e);
      }
    } else {
      console.log(`✅ ${mint} - Fiyat stabil (${currentPrice})`);
    }
  }
}

setInterval(checkAllTokens, CHECK_INTERVAL);
