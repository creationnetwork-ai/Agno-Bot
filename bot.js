require("dotenv").config();
const fs = require("fs");
const fetch = require("node-fetch");
const bs58 = require("bs58").default;
const {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  PublicKey,
} = require("@solana/web3.js");
const Client = require("@triton-one/yellowstone-grpc").default;
const { CommitmentLevel } = require("@triton-one/yellowstone-grpc");

class CopyTradeBot {
  config = {
    WATCH_LIST: process.env.WATCH_LIST.split(","),
    MIN_TX_AMOUNT: LAMPORTS_PER_SOL * 3,
    BUY_AMOUNT: LAMPORTS_PER_SOL * 0.1,
    LOG_FILE: "agnobot_swaps.json",
    COMMITMENT: CommitmentLevel.CONFIRMED,
    TEST_MODE: true,
    TOKEN_PROGRAM_ID: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    COMMON_DEX_PROGRAMS: [
      "9xQeWvG816bUx9EPua5xkPy5qqkq3Tz7fvTq9m1bGTbT", // Serum
      "RVKd61ztZW9aFRuKnbwh6BqzJ8bDgSUn4tjL9qep8vZ", // Raydium
      "4ckmDgGzLYLyxnYz5qT9bTDsC6F9no8DyzbX5zGdfB9g", // Orca
      "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", // Jupiter v4
    ]
  };

  constructor() {
    this.validateEnv();

    this.connection = new Connection(process.env.SOLANA_RPC);
    this.wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.SECRET_KEY))
    );

    console.log("🤖 Maven-BOT wallet:", this.wallet.publicKey.toBase58());
    console.log("🔍 İzlenen cüzdanlar:");
    this.config.WATCH_LIST.forEach((address) => console.log("   -", address));
  }

  validateEnv() {
    const required = [
      "SOLANA_RPC",
      "SECRET_KEY",
      "METIS_ENDPOINT",
      "YELLOWSTONE_ENDPOINT",
      "YELLOWSTONE_TOKEN",
    ];
    required.forEach((key) => {
      if (!process.env[key]) {
        throw new Error(`Eksik ortam değişkeni: ${key}`);
      }
    });
  }

  fetchSwapTransaction = async ({ wallet, type, mint, inAmount, priorityFeeLevel = "high", slippageBps = "300" }) => {
    const body = JSON.stringify({ wallet, type, mint, inAmount, priorityFeeLevel, slippageBps });
    const res = await fetch(`${process.env.METIS_ENDPOINT}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      throw new Error(`Swap fetch error: ${await res.text()}`);
    }
    return res.json();
  };

  signTransaction = async (swapTransaction) => {
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
    const latestBlockhash = await this.connection.getLatestBlockhash();
    tx.message.recentBlockhash = latestBlockhash.blockhash;
    tx.sign([this.wallet]);
    return Buffer.from(tx.serialize()).toString("base64");
  };

  sendAndConfirmTransaction = async (signedTxBase64) => {
    try {
      const txid = await this.connection.sendEncodedTransaction(signedTxBase64, {
        skipPreflight: false,
        encoding: "base64",
      });

      const timeout = 30_000;
      const poll = 3_000;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const status = await this.connection.getSignatureStatuses([txid]);
        const info = status?.value?.[0];
        if (info?.confirmationStatus === "confirmed" || info?.confirmationStatus === "finalized") {
          return txid;
        }
        if (info?.err) throw new Error(`Transaction failed: ${JSON.stringify(info.err)}`);
        await new Promise(res => setTimeout(res, poll));
      }
      throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
    } catch (err) {
      throw { err, base64: signedTxBase64 };
    }
  };

  logSwap = (log) => {
    const existing = fs.existsSync(this.config.LOG_FILE)
      ? JSON.parse(fs.readFileSync(this.config.LOG_FILE, "utf-8"))
      : [];
    existing.push(log);
    fs.writeFileSync(this.config.LOG_FILE, JSON.stringify(existing, null, 2));
  };

  handleWhaleBuy = async (whalePubkey, tokenMint, lamportsSpent, copiedTxid) => {
    if (lamportsSpent < this.config.MIN_TX_AMOUNT) return;

    try {
      const inAmount = this.config.BUY_AMOUNT;
      const response = await this.fetchSwapTransaction({
        wallet: this.wallet.publicKey.toBase58(),
        type: "BUY",
        mint: tokenMint,
        inAmount,
      });

      if (!response.tx) throw new Error(`Unexpected response: ${JSON.stringify(response)}`);
      const signedTx = await this.signTransaction(response.tx);

      let txid = "Simulated-TxID";
      if (!this.config.TEST_MODE) {
        txid = await this.sendAndConfirmTransaction(signedTx);
      }

      console.log("🎯 BUY copied => TxID:", txid);

      // 📥 Token'i memory'ye kaydet
      const memory = require("./memory");
      memory.addOrUpdateToken(tokenMint, inAmount / LAMPORTS_PER_SOL);

      this.logSwap({
        event: "COPY_BUY",
        txid,
        copiedTxid,
        tokenMint,
        whalePubkey,
        lamportsSpent,
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      this.logSwap({
        event: "COPY_BUY_ERROR",
        error: err?.message || JSON.stringify(err),
        copiedTxid,
        tokenMint,
        whalePubkey,
        timestamp: new Date().toISOString(),
      });
    }
  };

  handleWhaleSell = async (whalePubkey, tokenMint, copiedTxid) => {
    try {
      const memory = require("./memory");
      const tokens = memory.getTokens();

      // Bu token cüzdanda yoksa işlem yapma
      if (!tokens[tokenMint]) {
        console.log(`⚠️ SELL skipped - ${tokenMint} not in memory`);
        return;
      }

      const response = await this.fetchSwapTransaction({
        wallet: this.wallet.publicKey.toBase58(),
        type: "SELL",
        mint: tokenMint,
        inAmount: 0, // Metis tüm bakiyeyi satıyor
      });

      if (!response.tx) throw new Error(`Unexpected response: ${JSON.stringify(response)}`);
      const signedTx = await this.signTransaction(response.tx);

      let txid = "Simulated-SellTxID";
      if (!this.config.TEST_MODE) {
        txid = await this.sendAndConfirmTransaction(signedTx);
      }

      console.log("📉 SELL copied => TxID:", txid);

      memory.removeToken(tokenMint); // satış sonrası hafızadan sil

      this.logSwap({
        event: "COPY_SELL",
        txid,
        copiedTxid,
        tokenMint,
        whalePubkey,
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      this.logSwap({
        event: "COPY_SELL_ERROR",
        error: err?.message || JSON.stringify(err),
        copiedTxid,
        tokenMint,
        whalePubkey,
        timestamp: new Date().toISOString(),
      });
    }
  };

  triggerStopLoss = async (mint) => {
    try {
      const memory = require("./memory");
      const tokens = memory.getTokens();
      const token = tokens[mint];
      if (!token) return;

      const res = await fetch(`${process.env.METIS_ENDPOINT}/price?mint=${mint}`);
      if (!res.ok) throw new Error(await res.text());
      const { price } = await res.json();

      const buyPrice = token.buyPrice;
      const lossThreshold = buyPrice * 0.87;

      if (price < lossThreshold) {
        console.log(`🛑 STOP/LOSS triggered for ${mint} (Buy: ${buyPrice}, Now: ${price})`);

        const swapRes = await this.fetchSwapTransaction({
          wallet: this.wallet.publicKey.toBase58(),
          type: "SELL",
          mint,
          inAmount: 0,
        });

        if (!swapRes.tx) throw new Error(`Unexpected response: ${JSON.stringify(swapRes)}`);
        const signedTx = await this.signTransaction(swapRes.tx);

        let txid = "Simulated-SLTxID";
        if (!this.config.TEST_MODE) {
          txid = await this.sendAndConfirmTransaction(signedTx);
        }

        memory.removeToken(mint);

        this.logSwap({
          event: "STOP_LOSS_SELL",
          txid,
          mint,
          buyPrice,
          sellPrice: price,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.logSwap({
        event: "STOP_LOSS_ERROR",
        error: err?.message || JSON.stringify(err),
        mint,
        timestamp: new Date().toISOString(),
      });
    }
  };

  handleData = (data) => {
    if (!this.isSubscribeUpdateTransaction(data)) return;
  
    const transaction = data.transaction?.transaction;
    const message = transaction?.transaction?.message;
    if (!transaction || !message || transaction?.meta?.err) return;
  
    const accountKeys = message.accountKeys.map((key) => key.toBase58());
    const instructions = message.instructions;
  
    const initiator = accountKeys[0];
    if (!this.config.WATCH_LIST.includes(initiator)) return;
  
    const involvedPrograms = instructions.map(ix => accountKeys[ix.programIdIndex]);
    const isSwap = involvedPrograms.some(programId =>
      this.config.COMMON_DEX_PROGRAMS.includes(programId)
    );
  
    if (!isSwap) return;
  
    const tokenMint = this.extractMintFromAccounts(accountKeys);
    const signature = this.convertSignature(transaction.signature).base58;
    const type = this.detectSwapDirection(initiator, tokenMint);
    const icon = type === "SELL" ? "📉" : "🎯";
  
    console.log(`${icon} ${type} TxID: ${signature}`);
    console.log("            Mint:", tokenMint);
    console.log("            User:", initiator);
  
    if (type === "BUY") {
      this.handleWhaleBuy(initiator, tokenMint, LAMPORTS_PER_SOL * 3, signature);
    } else {
      this.handleWhaleSell(initiator, tokenMint, signature);
    }
  };
  
  isSubscribeUpdateTransaction = (data) => {
    return (
      "transaction" in data &&
      typeof data.transaction === "object" &&
      data.transaction !== null &&
      "slot" in data.transaction &&
      "transaction" in data.transaction
    );
  };
  
  convertSignature = (signature) => {
    return { base58: bs58.encode(Buffer.from(signature)) };
  };
  
  detectSwapDirection = (userPubkey, mint) => {
    const memory = require("./memory");
    const tokens = memory.getTokens();
    return tokens[mint] ? "SELL" : "BUY";
  };
  
  extractMintFromAccounts = (accountKeys) => {
    return accountKeys[accountKeys.length - 1];
  };
  
  createSubscribeRequest = () => {
    const { WATCH_LIST, COMMITMENT } = this.config;
    return {
      transactions: {
        agnoBot: {
          accountInclude: WATCH_LIST,
          accountExclude: [],
          accountRequired: [],
        },
      },
      commitment: COMMITMENT,
      accounts: {},
      slots: {},
      transactionsStatus: {},
      entry: {},
      blocks: {},
      blocksMeta: {},
      accountsDataSlice: [],
      ping: undefined,
    };
  };
  
  sendSubscribeRequest = (stream, request) => {
    return new Promise((resolve, reject) => {
      stream.write(request, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };
  
  handleStreamEvents = (stream) => {
    return new Promise((resolve, reject) => {
      stream.on("data", this.handleData);
      stream.on("error", (error) => {
        console.error("Stream error:", error);
        reject(error);
        stream.end();
      });
      stream.on("end", () => {
        console.log("Stream ended");
        resolve();
      });
      stream.on("close", () => {
        console.log("Stream closed");
        resolve();
      });
    });
  };  

  monitorWhales = async () => {
    console.log("📡 Monitoring whales across all DEXes...");

    try {
      const client = new Client(
        process.env.YELLOWSTONE_ENDPOINT,
        process.env.YELLOWSTONE_TOKEN,
        {}
      );

      const stream = await client.subscribe();
      const request = this.createSubscribeRequest();

      await this.sendSubscribeRequest(stream, request);
      console.log("✅ Geyser connection established - watching whale activity...");

      await this.handleStreamEvents(stream);

    } catch (error) {
      console.error("❌ Error in subscription process:", error);
    }
  };

  async start() {
    console.log("🤖 Agno-BOT Starting on Solana mainnet...");
    await this.monitorWhales();
  }
} // 👈 Sınıf kapanışı

// ⬇️ Botu başlatan dış main fonksiyonu:
async function main() {
  const bot = new CopyTradeBot();
  global.triggerStopLoss = bot.triggerStopLoss;

  // 💥 TEST fonksiyonları burada:
  global.__botInstance = bot;

  global.triggerBuyTest = async () => {
    const fakeWhale = "BHREKFkPQgAtDs8Vb1UfLkUpjG6ScidTjHaCWFuG2AtX";
    const fakeMint = "So11111111111111111111111111111111111111112";
    const fakeTxid = "Simulated-Test-BuyTxid";

    await bot.handleWhaleBuy(fakeWhale, fakeMint, LAMPORTS_PER_SOL * 3, fakeTxid);
  };

  global.triggerSellTest = async () => {
    const fakeWhale = "BHREKFkPQgAtDs8Vb1UfLkUpjG6ScidTjHaCWFuG2AtX";
    const fakeMint = "So11111111111111111111111111111111111111112";
    const fakeTxid = "Simulated-Test-SellTxid";

    const memory = require("./memory");
    memory.addOrUpdateToken(fakeMint, 3.0); // sahte token elde var gibi hafızaya yaz

    await bot.handleWhaleSell(fakeWhale, fakeMint, fakeTxid);
  };

  await bot.start();
  await global.triggerBuyTest();
  await global.triggerSellTest();

}

main().catch(console.error);

module.exports = CopyTradeBot;
