import * as dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'
const myEnv = dotenv.config()
dotenvExpand.expand(myEnv)
import { Env } from "@humanwhocodes/env";
const env = new Env();
import fs from "fs/promises"
import fss from "fs"
import fetch from "node-fetch"
import pm2 from "./pm2/pm2-promise.js"
import {isProcessStarted} from "./pm2/pm2-util.js";
import cron from "node-cron";
import logger from "./logging/index.js";

const {
    DOMAIN,
    AGENT_TOKEN,
    AGENT_URL,
    AGENT_DIRECTORY,
    AGENT_HASH_URL,
    AGENT_ENV_URL,
    AGENT_ENV_HASH_URL,
    AGENT_PROCESS_NAME,
} = env.required;



const AGENT_PATH = AGENT_DIRECTORY + "/agent.js"
const AGENT_ENV_PATH = AGENT_DIRECTORY + "/agent.json"
const AGENT_PATH_HASH = AGENT_DIRECTORY + "/agent.js.hash"
const AGENT_PATH_ENVHASH = AGENT_DIRECTORY + "/agent.env.hash"


if (!fss.existsSync(AGENT_DIRECTORY)) {
    fss.mkdirSync(AGENT_DIRECTORY)
}

fss.writeFileSync(AGENT_PATH,"noagentyet",{ flag: 'w+' ,encoding:"utf-8"})
logger.info(`file : ${AGENT_PATH}  did not exist ! created one`);
fss.writeFileSync(AGENT_ENV_PATH,JSON.stringify({agentHash:"nohashyet",env:{hash:"nohashyet"}}),{ flag: 'w+' ,encoding:"utf-8"})
logger.info(`file : ${AGENT_ENV_PATH}  did not exist ! created one`);

const fetchOption = {
    method: 'post',
    body: JSON.stringify({token:AGENT_TOKEN}),
    headers: {'Content-Type': 'application/json'}
}

async function getAgentHash() {
    return fetch(AGENT_HASH_URL,fetchOption)
        .then((response)=>{
            return response.json()
        })
        .then(body => {
            if(body.success){
                logger.info('successfully get agent hash : ');
                logger.info(`=> ${body.data.hash}`);
                return body.data.hash
            }
            throw new Error("server say : "+ body.message)
        })
        .catch(function (error) {
            error.message = "error getting agent hash => " + error.message
            throw error
        })
}

async function getAgentEnvHash() {
    console.log(AGENT_ENV_HASH_URL)
    return fetch(AGENT_ENV_HASH_URL,fetchOption)
        .then((response)=>{
            return response.json()
        })
        .then(body => {
            if(body.success){
                logger.info('successfully get environment hash');
                logger.debug('successfully get environment hash (getAgentEnvHash)');
                return body.data.env.hash
            }
            throw new Error("server say : "+ body.message)

        })
        .catch(function (error) {
            error.message = "error getting env hash => " + error.message
            throw error
        })
}


async function getAgent() {
    return await fetch(AGENT_URL,fetchOption)
        .then((response)=>{
            return response.json()
        }).then(body => {
            if(body.success){
                logger.info('successfully get agent');
                return body.data.file
            }
            throw new Error("server say : "+ body.message)
        })
        .catch(function (error) {
            error.message = "error getting agent => " + error.message
            throw error
        })
}

async function getAgentEnv() {
    return await fetch(AGENT_ENV_URL,fetchOption)
        .then((response)=>{
            return response.json()
        })
        .then(body => {
            if(body.success){
                logger.info('successfully get agent environment variable');
                return body.data.env
            }
            throw new Error("server say : "+ body.message)
        })
        .catch(function (error) {
            error.message = "error getting agent env => " + error.message
            throw error
        })
}

async function updateAgent() {
    try {

    //get hash
    const AgentHash = await getAgentHash()
    const EnvHash = await getAgentEnvHash()
    logger.debug(`AgentHash: ${AgentHash}`)
    logger.debug(`EnvHash: ${EnvHash}`)

    //get previous hashes
    const ENV = JSON.parse(await fs.readFile(AGENT_ENV_PATH,"utf-8"))
    const prevAgentHash = ENV.agentHash
    const prevEnvHash = ENV.env.hash

    logger.debug(`prevAgentHash: ${prevAgentHash}`)
    logger.debug(`prevEnvHash: ${prevEnvHash}`)
    if ( (EnvHash !== prevEnvHash) || (prevAgentHash !== AgentHash) ) {
        logger.info(`env was different start updating file`)

        await fs.writeFile(AGENT_PATH,await getAgent(),"utf-8");
        logger.debug(`env new content: ${ENV}`);
        logger.info(`successfully writing agent env file`);

        const env_content =  await getAgentEnv()

        ENV.env = {...env_content,hash: EnvHash}
        ENV.agentHash = AgentHash

        await fs.writeFile(AGENT_ENV_PATH,JSON.stringify(ENV),"utf-8");
        logger.debug(`env new content: ${ENV}`);
        logger.info(`successfully writing agent env file`);



        return true
        }
        return false
    }catch (error) {
        logger.error("error updating agent : => "+error.message)
        console.log(error)
    }
}

let n = 0;
const fullProcess = async ()=>{
    try {
        await pm2.connect()

        const agentUpdated = await updateAgent()

        let AGENT_ENV = JSON.parse(
            fss.readFileSync(AGENT_ENV_PATH,"utf-8")
        )
        delete AGENT_ENV.env.hash


        logger.debug(`env : \n${JSON.stringify(AGENT_ENV,null,2)}`);
        logger.debug(`agent need update ? ${agentUpdated}`);


        if(agentUpdated) {
            logger.info(`agent updated !!! so go from pm2`);
            if(! await isProcessStarted(AGENT_PROCESS_NAME)){
                await pm2.start({
                    script    : AGENT_PATH,
                    name      : AGENT_PROCESS_NAME,
                    env       : AGENT_ENV.env,
                })
                logger.info(`script did not start before , it now started`);
            } else {
                await pm2.delete(AGENT_PROCESS_NAME)
                await pm2.start({
                    script    : AGENT_PATH,
                    name      : AGENT_PROCESS_NAME,
                    env       : AGENT_ENV.env,
                })
                logger.info(`script restarted in pm2 watch agent !`);
            }
        }
    }catch (error) {
        logger.error(error.message)
        console.log(error)
    } finally {
        await pm2.disconnect()
    }
}
(async function(){

await fullProcess()
console.log("TIMER : ",process.env.TIMER || "*/30 * * * *")
cron.schedule(process.env.TIMER || "*/30 * * * *",async ()=>{
    await fullProcess()
})
})()
