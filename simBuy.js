require("./bot");

setTimeout(async () => {
  if (global.triggerBuyTest) {
    console.log("🎯 Simülasyon başlatılıyor: triggerBuyTest...");
    await global.triggerBuyTest();
    console.log("✅ Simülasyon tamamlandı.");
  } else {
    console.error("❌ triggerBuyTest fonksiyonu tanımlı değil.");
  }
  process.exit(0);
}, 3000); // bot yüklenmeden çağrılırsa hata olur, o yüzden 3sn bekleme
