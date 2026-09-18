const CONFIG = Object.freeze({
  ADMIN_EMAIL: "info@theforestgym.com",
  AGREEMENT_VERSION: "2026-09-18",
  TIME_ZONE: "Asia/Tokyo",
  MAX_DAILY_SENDS: 50,
  DEDUPE_SECONDS: 600
});

const AGREEMENT_TEXT = `１．ダイエットオンライン食事管理の概要

ダイエットオンライン食事管理（以下、「当プログラム」といいます。）は、当社が運営するThe Forest Gym（以下、「当ジム」といいます。）で提供しているダイエット特化パーソナルトレーニングと同様の食事管理をオンラインで提供する減量及びリバウンド防止を目的としたプログラムです。日々の食事管理を当ジムスタッフが主体的に指導することにより目標体重までの減量を目指します。

２．当プログラムで提供されるサービスについて

当プログラムでは、お申込みに先立ち行われる無料カウンセリングの内容に基づき以下のサービスをクライアント様に提供します。

1. クライアント様毎に3か月後の減量目標の設定（どの程度の減量を目指せるのか）支援
2. 食事の指針となるPFC（タンパク質、脂肪、炭水化物）の1日の摂取基準値の提示
3. クライアント様の減量に適切な食事のレシピ集の提示
4. 毎日のクライアント様のお食事内容の確認と助言

ご希望に応じて以下のサービスも提供いたします。

1. クライアント様毎に具体的な1日のメニュー例の提示
2. オンラインによる追加カウンセリング（1回15分程度。最大3回まで）

サービスの以下の点にご注意ください

1. 当プログラムの、食事管理は、十分なダイエット実績に基づいた手法を採用していますが、効果は絶対的なものではなく個人差があることをクライアント様はご理解下さい。
2. 糖質制限を行うと便通がわるくなることがあるほか、ごく稀に肌にかゆみが出ることがあります。症状の程度によっては病院での診察をお勧めします。
3. 毎回の食事の内容の他、予め決めさせて頂いた数値を、ラインの専用アカウント宛てにお送り頂きます。当ジムスタッフは確認後、内容・数値に問題が無いと判断した場合、また、減量進捗が概ね順調と判断した場合など返信をしないこともあります。
4. 目標達成日、または最大6ヶ月で食事指導は原則終了します。

３．費用について

金額は以下の通りです。

72,600円（税込）
※キャンペーン価格（通常145,200円）

クライアント様のご都合、または減量成果を理由にご返金は致しません。また、上記の金額を他の目的に充当することは出来ません。

４．個人情報の取り扱い・口コミについて

1. この度知りえた当ジムスタッフ、クライアント様の個人情報については、本人の許可無く、第三者に開示しないようお互いが責任を持って管理するものとします。
2. クライアント様は自身の体重推移その他数値データを匿名での使用に限り当ジムが販売促進の目的に利用すること、また、当ジムの要請があった場合、匿名での口コミ等販売促進に協力することに同意頂くものとします。

【お申込み時の確認】
本同意書内容について説明を受けたほか、食事管理方法も説明を受け理解したうえで、オンライン食事管理に申込いたします。`;

function doPost(e) {
  let lock;

  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const applicationDate = String(payload.applicationDate || "").trim();
    const name = cleanText_(payload.name, 100);
    const email = String(payload.email || "").trim().toLowerCase();
    const today = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy-MM-dd");

    if (applicationDate !== today) {
      return json_({ ok: false, error: "invalid_application_date" });
    }

    if (!name || !isValidEmail_(email)) {
      return json_({ ok: false, error: "invalid_contact" });
    }

    if (payload.agreementAccepted !== true || payload.agreementVersion !== CONFIG.AGREEMENT_VERSION) {
      return json_({ ok: false, error: "agreement_required" });
    }

    lock = LockService.getScriptLock();
    lock.waitLock(5000);

    const cache = CacheService.getScriptCache();
    const dedupeKey = buildDedupeKey_(email, applicationDate);
    if (cache.get(dedupeKey)) {
      return json_({ ok: true, duplicate: true });
    }

    const properties = PropertiesService.getScriptProperties();
    const countKey = "SEND_COUNT_" + today;
    const sentToday = Number(properties.getProperty(countKey) || 0);

    if (sentToday >= CONFIG.MAX_DAILY_SENDS || MailApp.getRemainingDailyQuota() < 2) {
      return json_({ ok: false, error: "mail_quota_exceeded" });
    }

    MailApp.sendEmail({
      to: email,
      bcc: CONFIG.ADMIN_EMAIL,
      subject: "【Meal Fit】オンライン食事管理お申込み受付",
      body: buildMailBody_(name, email, applicationDate),
      name: "Meal Fit",
      replyTo: CONFIG.ADMIN_EMAIL
    });

    properties.setProperty(countKey, String(sentToday + 1));
    cache.put(dedupeKey, "sent", CONFIG.DEDUPE_SECONDS);

    return json_({ ok: true });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: "server_error" });
  } finally {
    if (lock && lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function buildMailBody_(name, email, applicationDate) {
  return `${name}様

Meal Fit オンライン食事管理へお申込みいただき、ありがとうございます。
以下の内容でお申込みを受け付けました。

お申込日：${applicationDate}
お名前：${name}
メールアドレス：${email}

お申込み時にご同意いただいた内容を、以下にすべて記載いたします。

━━━━━━━━━━━━━━━━━━━━
${AGREEMENT_TEXT}
━━━━━━━━━━━━━━━━━━━━

The Forest Gym / Meal Fit
お問い合わせ：${CONFIG.ADMIN_EMAIL}`;
}

function cleanText_(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function buildDedupeKey_(email, applicationDate) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    email + "|" + applicationDate,
    Utilities.Charset.UTF_8
  );

  return "sent_" + Utilities.base64EncodeWebSafe(digest).slice(0, 40);
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
