const solarLunar = require("solarlunar");
const fetch = require('node-fetch');
const moment = require('moment-timezone');
const HTMLParser = require('node-html-parser');
const core = require('@actions/core');
const MD5 = require("./md5");
const { NlpManager } = require('node-nlp');
const html2md = require('html-to-md')

const deepai = require('deepai');

const dotenv = require("dotenv")

dotenv.config()

const { DEEPAI: DEEPAI, Title: Title, Content: Content, CLOUDFLARE_EMAIL: CLOUDFLARE_EMAIL, CLOUDFLARE_API: CLOUDFLARE_API, CLOUDFLARE_ID: CLOUDFLARE_ID, KV_ID: KV_ID, From: From, BAIDU_APPID: BAIDU_APPID, BAIDU_KEY: BAIDU_KEY, APP_TOKEN: APP_TOKEN, UID_ERR: UID_ERR } = process.env;
var { UID: UID } = process.env;

if (DEEPAI.localeCompare("") == 0 || BAIDU_APPID.localeCompare("") == 0 || CLOUDFLARE_EMAIL.localeCompare("") == 0 || CLOUDFLARE_API.localeCompare("") == 0 || CLOUDFLARE_ID.localeCompare("") == 0 || KV_ID.localeCompare("") == 0 || BAIDU_KEY.localeCompare("") == 0 || APP_TOKEN.localeCompare("") == 0 || UID_ERR.localeCompare("") == 0 || Title.localeCompare("") == 0 || Content.localeCompare("") == 0 || From.localeCompare("") == 0) {
    core.setFailed(`Action failed because of empty required secrets.`);
}

var manager;

deepai.setApiKey(DEEPAI);

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

    await manager.train();
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

async function sendMessage(message) {
    let uids = [];
    for (let i of UID.split(";")) {
        if (i.length != 0)
            uids.push(i);
    }
    let response;
    if (Array.isArray(message)) {
        for (let i of message) {
            response = await fetch("http://wxpusher.zjiecode.com/api/send/message", {
                "headers": {
                    "accept": "*/*",
                    "content-type": "application/json"
                },
                "body": JSON.stringify({
                    "appToken": APP_TOKEN,
                    "content": i,
                    "contentType": 1,//内容类型 1表示文字  2表示html(只发送body标签内部的数据即可，不包括body标签) 3表示markdown 
                    "uids": uids,
                    "url": undefined //原文链接，可选参数
                }),
                "method": "POST"
            });
            // await response.json();
            await new Promise(r => setTimeout(r, 60000));
        }
    } else {
        response = await fetch("http://wxpusher.zjiecode.com/api/send/message", {
            "headers": {
                "accept": "*/*",
                "content-type": "application/json"
            },
            "body": JSON.stringify({
                "appToken": APP_TOKEN,
                "content": message,
                "contentType": 1,//内容类型 1表示文字  2表示html(只发送body标签内部的数据即可，不包括body标签) 3表示markdown 
                "uids": uids,
                "url": undefined //原文链接，可选参数
            }),
            "method": "POST"
        });
        // await response.json();
        await new Promise(r => setTimeout(r, 60000));
    }
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
            "contentType": 1,//内容类型 1表示文字  2表示html(只发送body标签内部的数据即可，不包括body标签) 3表示markdown 
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

async function getContent(root) {
    //TODO: Need replace
    let contentArray = root;
    let length = contentArray.length;
    for (let i = 0; i < length; i++) {
        contentArray.splice((2 * i + 1), 0, await translate(contentArray[(2 * i)]) + "\n");
    }
    return contentArray.join("\n");
}


async function handleData() {
    let root = HTMLParser.parse(Content, {
        lowerCaseTagName: true
    });
    core.info("Successfully parsed");

    if (root.querySelectorAll("body").length != 0) {
        root = root.querySelectorAll("body")[0];
    }
    core.info("Successfully parsed");

    for (let i of root.querySelectorAll('div[style*="display: none;"]')) {
        i.parentNode.removeChild(i);
    }
    core.info("Successfully parsed");

    // let contentArray = root.structuredText().split("\n");
    // let index = 0;
    // let dict = {};
    // for (; index < contentArray.length; index++) {

    // }

    // core.info(contentArray)

    for (let i of root.querySelectorAll("a")) {
        i.parentNode.exchangeChild(i, HTMLParser.parse("<span>" + i.text + "</span>"))
    }

    //remove all image attributes
    for (let i of root.querySelectorAll("img")) {
        i.remove();
    }

    //translation


    let content = html2md(root.toString(), {
        skipTags: ['table', 'tr', 'td', 'tbody', 'font', 'thead', 'th', 'center']
    });

    let contentArray = content.split("\n");
    console.log(root.text)

    console.log(await truncate(root.text))

    // const response = await manager.process('en', 'This message covers');
    // console.log(response);

    // core.info("Start to get summary");

    let summary = "";

    // core.info("Successfully get summary");
    // core.info("Start to get content");

    // let content = await getContent(root);
    // core.info("Successfully get content");

}

async function main() {
    //console.log(await getSchoolData());
    //mainFunction();
    try {
        //console.log(await translate("apple"));
        await handleData();
        // await initNlp();
        // core.info("Start to send message");
        // console.log(result[1])
        // await sendMessage(getTime() + result[0], result[1]);
        // core.info("Message sent");
    } catch (e) {
        // await sendErrorMessage("Error happened " + e)
    }
    //getTime();
}

main();
