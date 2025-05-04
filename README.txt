Agno-BOT

Agno-BOT is a high-speed copy-trading bot running on the Solana mainnet. It monitors specific wallet addresses and mirrors their swap (buy/sell) transactions in real time using its own wallet.

This bot is platform-agnostic and not tied to any specific DEX. It detects and reacts to swaps from any major Solana DEX such as Raydium, Orca, Jupiter, Serum, etc.

---

Features

- Operates on the Solana mainnet
- Uses Yellowstone gRPC (Geyser) to monitor all confirmed transactions
- Automatically copies 10% of any detected buy transaction from tracked wallets
- Sells all of a token when a tracked wallet sells the same token
- Implements a stop-loss system that sells at a 13% loss
- Stores active tokens in memory.js for tracking
- Logs all actions to agnobot_swaps.json

---

Setup

1. Install dependencies:

   npm install

2. Create a .env file based on the following format:

   SECRET_KEY=[....] // Your Solana wallet secret key as a JSON array
   SOLANA_RPC=https://...
   METIS_ENDPOINT=https://...
   YELLOWSTONE_ENDPOINT=https://...
   YELLOWSTONE_TOKEN=...
   WATCH_LIST=Wallet1,Wallet2,...

---

Usage

Start the bot:

   node bot.js

Run buy simulation test:

   node simbuy.js

For stop-loss or SELL test:

   node simsell.js  (if exists)

---

Architecture

- Subscribes to Solana via Yellowstone gRPC
- Filters all transaction logs to detect swap activity
- When a swap is detected:
  - Verifies if the initiator is in the WATCH_LIST
  - Confirms the program ID belongs to a known DEX
  - Determines transaction type (BUY or SELL)
  - For BUY: fetches and signs swap using Metis API
  - For SELL: validates token is in memory, then fetches swap to sell all

---

Test Functions

Inside the main() function, these test methods are available:

- global.triggerBuyTest()
  Simulates a whale buy transaction to test bot’s BUY logic

- global.triggerSellTest()
  Simulates a whale sell transaction to test bot’s SELL logic

You can use files like simbuy.js to call these methods automatically.

---

Logging and Memory

- All activity (buy/sell/stop-loss) is saved to agnobot_swaps.json
- Tokens are stored in memory.js until sold or removed by stop-loss

---

Notes

- If TEST_MODE=true, transactions are simulated only and not sent to the blockchain
- BUY_AMOUNT determines the percentage used for copy trading (default 10%)
- MIN_TX_AMOUNT is the threshold (default 3 SOL) for tracking whale swaps
- Always test before using with real funds


Agno-BOT

Agno-BOT, Solana ana ağı üzerinde izlenen cüzdanların yaptığı swap (alım-satım) işlemlerini gerçek zamanlı olarak tespit eden ve aynı işlemleri kendi cüzdanıyla otomatik olarak kopyalayan yüksek hızlı bir copy-trading botudur.

Bu bot herhangi bir DEX veya platforma bağlı değildir. İzlediği cüzdanların yaptığı swap işlemleri hangi protokol üzerinden olursa olsun (Raydium, Orca, Jupiter, Serum vb.) tespit eder ve işlem mantığını uygular.

---

Genel Özellikler

- Solana ana ağı üzerinde çalışır
- Geyser (Yellowstone gRPC) kullanarak swap işlemlerini anında algılar
- İzlenen cüzdanlar swap yaptığında aynı token'dan yüzde 10 oranında alım yapar
- İzlenen cüzdan token sattığında, bot elindeki tüm o token'ı satar
- Stop-loss mekanizması ile %13 zarar durumunda otomatik satış yapar
- Takip edilen token'ları memory.js dosyasında hafızada tutar
- Tüm işlemler agnobot_swaps.json dosyasına loglanır

---

Kurulum

1. Gerekli paketleri kurun:

   npm install

2. .env dosyasını oluşturun:

   Aşağıdaki örneğe göre bir .env dosyası oluşturun:

   SECRET_KEY=[....] // Cüzdanın secret key'i (JSON array olarak)
   SOLANA_RPC=https://...
   METIS_ENDPOINT=https://...
   YELLOWSTONE_ENDPOINT=https://...
   YELLOWSTONE_TOKEN=...
   WATCH_LIST=Wallet1,Wallet2,...

---

Kullanım

Botu başlatmak için:

   node bot.js

Swap işlem testini simüle etmek için:

   node simbuy.js

Stop-loss veya SELL testi yapmak için:

   node simsats.js  (varsa)

---

Mimari

- Yellowstone gRPC ile Solana ağına abone olunur
- Tüm transaction logları alınır, swap içerip içermediği filtrelenir
- Swap işlemi tespit edildiğinde:
  - Kullanıcı izleniyorsa
  - Swap yapan program desteklenen DEX’lerden biriyse
  - Alım-satım tipi belirlenir
  - Alım için Metis API'den swap işlemi hazırlanır
  - Satış için token hafızada varsa Metis API'den satış işlemi yapılır

---

Test Fonksiyonları

main() fonksiyonunda aşağıdaki test metodları tanımlıdır:

- global.triggerBuyTest()
  Sahte bir whale alım işlemi simüle eder ve botun BUY mantığını test eder

- global.triggerSellTest()
  Sahte bir whale satış işlemi simüle eder ve botun SELL mantığını test eder

Bu fonksiyonları otomatik çalıştırmak için simbuy.js gibi dosyalar oluşturulabilir.

---

Loglama ve Bellek

- Tüm alım/satım/stop-loss işlemleri agnobot_swaps.json dosyasına kaydedilir
- Hafızada tutulan token’lar memory.js dosyasında saklanır
  Bu token'lar stop-loss veya satış ile silinir

---

Notlar

- TEST_MODE=true ise işlemler blockchain'e gönderilmez, sadece simülasyon yapılır
- Alım oranı config içindeki BUY_AMOUNT parametresi ile belirlenir
- Minimum whale işlemi tespiti için MIN_TX_AMOUNT kullanılır
- Gerçek işlemler öncesinde test yapılması önerilir
