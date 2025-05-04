const fs = require('fs');
const path = './tokenMemory.json';

function loadMemory() {
  if (!fs.existsSync(path)) return {};
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function saveMemory(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function addOrUpdateToken(mint, buyPrice, amount) {
  const memory = loadMemory();

  if (memory[mint]) {
    // Önceki veriyi birleştir
    const existing = memory[mint];
    const totalAmount = existing.amount + amount;
    const avgPrice = ((existing.buyPrice * existing.amount) + (buyPrice * amount)) / totalAmount;
    memory[mint] = {
      buyPrice: avgPrice,
      amount: totalAmount,
    };
  } else {
    // İlk defa ekleniyorsa
    memory[mint] = {
      buyPrice,
      amount,
    };
  }

  saveMemory(memory);
}

function removeToken(mint) {
  const memory = loadMemory();
  if (memory[mint]) {
    delete memory[mint];
    saveMemory(memory);
  }
}

function getTokens() {
  return loadMemory();
}

module.exports = {
  addOrUpdateToken,
  removeToken,
  getTokens,
};
