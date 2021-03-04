const solarLunar = require("solarlunar");
const fetch = require('node-fetch');
const moment = require('moment-timezone');
const HTMLParser = require('node-html-parser');
const core = require('@actions/core');
const MD5 = require("./md5");
const { NlpManager, ConversationContext } = require('node-nlp');
const html2md = require('html-to-md')
const Tokenizer = require('sentence-tokenizer');
// const deepai = require('deepai')

const dotenv = require("dotenv")

dotenv.config()

const { Title: Title, Content: Content, CLOUDFLARE_EMAIL: CLOUDFLARE_EMAIL, CLOUDFLARE_API: CLOUDFLARE_API, CLOUDFLARE_ID: CLOUDFLARE_ID, KV_ID: KV_ID, From: From, BAIDU_APPID: BAIDU_APPID, BAIDU_KEY: BAIDU_KEY, APP_TOKEN: APP_TOKEN, UID_ERR: UID_ERR } = process.env;
var { UID: UID } = process.env;

if (BAIDU_APPID.localeCompare("") == 0 || CLOUDFLARE_EMAIL.localeCompare("") == 0 || CLOUDFLARE_API.localeCompare("") == 0 || CLOUDFLARE_ID.localeCompare("") == 0 || KV_ID.localeCompare("") == 0 || BAIDU_KEY.localeCompare("") == 0 || APP_TOKEN.localeCompare("") == 0 || UID_ERR.localeCompare("") == 0 || Title.localeCompare("") == 0 || Content.localeCompare("") == 0 || From.localeCompare("") == 0) {
    core.setFailed(`Action failed because of empty required secrets.`);
}


core.setSecret(Title);
core.setSecret(Content);
core.setSecret(From);

// deepai.setApiKey(DEEPAI);

var manager;

// GET accounts/:account_identifier/storage/kv/namespaces/:namespace_identifier/values/:key_name
async function loadUID() {
    if (UID == null || UID == undefined) {
        let response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + CLOUDFLARE_ID + "/storage/kv/namespaces/" + KV_ID + "/values/list", {
            headers: {
                "X-Auth-Email": CLOUDFLARE_EMAIL,
                "X-Auth-Key": CLOUDFLARE_API
            }
        })
        UID = await response.text();
    }
    //core.info(UID);
    // load yesterday data:
}



async function initNlp() {

    manager = new NlpManager({ languages: ['en'], forceNER: true });
    // Adds the utterances and intents for the NLP
    manager.addDocument('en', 'This message covers', 'start');
    manager.addDocument('en', 'This message contains', 'start');
    manager.addDocument('en', 'This message includes', 'start');
    manager.addDocument('en', "You are receiving this communication because you are a member of UW-Madison and included on distribution lists for official university correspondence.", 'end');
    manager.addDocument('en', "University Health Services has provided more than %number% doses of COVID-19 vaccines", "vaccine")
    manager.addDocument('en', "%number% doses of vaccines has been administrated", "vaccine")
    manager.addDocument('en', "have administrated %number% doses of vaccines", "vaccine")
    manager.addDocument('en', "have provided %number% doses of vaccines", "vaccine")


    await manager.train();
    // console.log(response)
    // console.log(context);
}


function getYear(str) {
    return parseInt(str.split("-")[0]);
}

function getMonth(str) {
    return parseInt(str.split("-")[1]);
}

function getDay(str) {
    return parseInt(str.split(" ")[0].split("-")[2]);
}

function getHour(str) {
    return parseInt(str.split(" ")[1].split(":")[0]);
}

function getMinute(str) {
    return parseInt(str.split(":")[1]);
}

function getSeconds(str) {
    return parseInt(str.split(":")[2]);
}

function getTime() {
    var timeCST = moment().tz('America/Chicago').format("YYYY-MM-DD HH:mm:ss");
    var timeBeijing = moment().tz('Asia/Shanghai').format("YYYY-MM-DD HH:mm:ss");
    //console.log(timeCST);
    //console.log(timeBeijing);
    let str = "[" + getYear(timeBeijing) + "年" + getMonth(timeBeijing) + "月" + getDay(timeBeijing) + "日,农历";
    const solar2lunarData = solarLunar.solar2lunar(getYear(timeBeijing), getMonth(timeBeijing), getDay(timeBeijing)); // 输入的日子为公历
    str += solar2lunarData.monthCn + solar2lunarData.dayCn;
    if (solar2lunarData.term != undefined && solar2lunarData.term.localeCompare('') != 0) {
        str += "\n今天是" + solar2lunarData.term;
    }
    str += "]\n";
    //console.log(str);
    return str;
}

function containIgnoreCases(message, toFind) {
    return message.toLowerCase().indexOf(toFind.toLowerCase()) != -1;
}

async function sendMessage(summary, message) {
    let uids = [];
    for (let i of UID.split(";")) {
        if (i.length != 0)
            uids.push(i);
    }
    let response = await fetch("http://wxpusher.zjiecode.com/api/send/message", {
        "headers": {
            "accept": "*/*",
            "content-type": "application/json"
        },
        "body": JSON.stringify({
            "appToken": APP_TOKEN,
            "summary": summary,
            "content": message,
            "contentType": 3,//内容类型 1表示文字  2表示html(只发送body标签内部的数据即可，不包括body标签) 3表示markdown 
            "uids": uids,
            "url": undefined //原文链接，可选参数
        }),
        "method": "POST"
    });

    return await response.json();
}

async function sendErrorMessage(message) {
    let uids = [];
    for (let i of UID_ERR.split(";")) {
        if (i.length != 0)
            uids.push(i);
    }
    let response = await fetch("http://wxpusher.zjiecode.com/api/send/message", {
        "headers": {
            "accept": "*/*",
            "content-type": "application/json"
        },
        "body": JSON.stringify({
            "appToken": APP_TOKEN,
            "content": message,
            "contentType": 3,//内容类型 1表示文字  2表示html(只发送body标签内部的数据即可，不包括body标签) 3表示markdown 
            "uids": uids,
            "url": undefined //原文链接，可选参数
        }),
        "method": "POST"
    });

    return await response.json();
}


function replaceAll(originalString, find, replace) {
    return originalString.replace(new RegExp(find, 'g'), replace);
}

function buildForm(details) {
    var formBody = [];
    for (var property in details) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(details[property]);
        formBody.push(encodedKey + "=" + encodedValue);
    }
    return formBody.join("&");
}

async function translate(message) {
    var salt = (new Date).getTime();
    var from = 'en';
    var to = 'zh';
    var str1 = BAIDU_APPID + message + salt + BAIDU_KEY;
    var sign = MD5(str1);
    let response;
    do {
        await new Promise(r => setTimeout(r, 1000));
        response = await fetch("http://api.fanyi.baidu.com/api/trans/vip/translate", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: buildForm({
                "q": message,
                "appid": BAIDU_APPID,
                "salt": salt,
                "from": from,
                "to": to,
                "sign": sign
            })
        })
        response = await response.json();
    } while (!response.hasOwnProperty("trans_result"));
    //console.log(response.trans_result);
    let str = "";
    for (let i of response.trans_result) {
        str += i.dst;
    }
    return str;
}

async function truncate(message) {
    var resp = await deepai.callStandardApi("summarization", {
        text: message,
    });
    return resp.output;
}

async function getInformation(message) {
    //get information
    var tokenizer = new Tokenizer('Chuck');
    tokenizer.setEntry(message);
    let content = "";
    for (let i of tokenizer.getSentences()) {
        const context = new ConversationContext();
        let response = await manager.process('en', i, context);
        if (response.intent.localeCompare("vaccine") == 0 && response.score > 0.9) {
            content += response.utterance + " ";
        }
    }
    return content;
}

async function handleData() {
    let root = HTMLParser.parse(Content, {
        lowerCaseTagName: true
    });
    core.info("Successfully parsed");

    if (root.querySelectorAll("body").length != 0) {
        root = root.querySelectorAll("body")[0];
    }

    for (let i of root.querySelectorAll('div[style*="display: none;"]')) {
        i.parentNode.removeChild(i);
    }

    let k = await getInformation(root.text);

    for (let i of root.querySelectorAll("a")) {
        i.parentNode.exchangeChild(i, HTMLParser.parse("<span>" + i.text + "</span>"))
    }

    //remove all image attributes
    for (let i of root.querySelectorAll("img")) {
        i.remove();
    }

    let content = html2md(root.toString(), {
        skipTags: ['table', 'tr', 'td', 'tbody', 'font', 'thead', 'th', 'center']
    });

    let contentArray = content.match(/[^\r\n]+/g);
    // console.log(content)
    // console.log(root.text)
    // console.log(contentArray.length) 
    // console.log(contentArray)
    let toRe = "";
    let length = contentArray.length;
    for (let i = 0; i < length; i++) {
        if(contentArray[i].trim().length == 0) continue;
        console.log(i + contentArray[i])
        toRe += contentArray[i] + "\n\n" + await translate(contentArray[i]) + "\n\n\n";
    }
    console.log(toRe);
    let summary = "学校下发了一周概览。" + await translate(k);

    return [summary, toRe];

}

async function main() {
    //console.log(await getSchoolData());
    //mainFunction();
    try {
        await loadUID();
        //console.log(await translate("apple"));
        await initNlp();
        let result = await handleData();
        core.info("Start to send message");
        // console.log(result[1])
        await sendMessage(result[0], result[1]);
        core.info("Message sent");
    } catch (e) {
        await sendErrorMessage("Error happened " + e)
        core.setFailed("Error happened " + e)
    }
    //getTime();
}

main();
