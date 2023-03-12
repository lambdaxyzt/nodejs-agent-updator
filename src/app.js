import * as dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'
const myEnv = dotenv.config()
dotenvExpand.expand(myEnv)
import { Env } from "@humanwhocodes/env";
const env = new Env();
import fs from "fs/promises"
import fss from "fs"
import fsExtra from "fs-extra"
import fetch from "node-fetch"
import pm2 from "./pm2/pm2-promise.js"
import {isProcessStarted, ListOfProcess} from "./pm2/pm2-util.js";
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

if (!fss.existsSync(AGENT_PATH)) {
    fss.writeFileSync(AGENT_PATH_ENVHASH,"noagentyet",{ flag: 'w+' ,encoding:"utf-8"})
    logger.info(`file : ${AGENT_PATH_ENVHASH}  did not exist ! created one`);
}
if (!fss.existsSync(AGENT_ENV_PATH)) {
    fss.writeFileSync(AGENT_PATH_ENVHASH,JSON.stringify({agentHash:"nohashyet",env:{hash:"nohashyet"}}),{ flag: 'w+' ,encoding:"utf-8"})
    logger.info(`file : ${AGENT_PATH_ENVHASH}  did not exist ! created one`);
}

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
                logger.info('successfully get agent hash');
                return body.data.hash
            }
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message + " : error getting hash");
            process.exit(2)
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
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message + " : error getting env hash");
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
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message  + " : error getting agent ");
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
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message  + " : error getting agent env ");
        })
}

async function updateAgent() {

    //get hash
    const AgentHash = await getAgentHash() || "nohashfound"
    const EnvHash = await getAgentEnvHash() || "nohashfound"
    logger.debug("AgentHash: ",AgentHash)
    logger.debug("EnvHash: ",EnvHash)

    //get previous hashes
    const ENV = JSON.parse(await fs.readFile(AGENT_ENV_PATH,"utf-8"))
    const prevAgentHash = ENV.agentHash
    const prevEnvHash = ENV.env.hash
    logger.debug("prevAgentHash: ",prevAgentHash)
    logger.debug("prevEnvHash: ",prevEnvHash)

    if ((prevAgentHash !== AgentHash) || (EnvHash !== prevEnvHash)) {
        logger.info(`hash was different start updating file`)

        const file_content = await getAgent()    || "noagentfound!"
        const env_content =  await getAgentEnv() || {}

        ENV.env = {...env_content,hash:EnvHash}
        ENV.agentHash = AgentHash

        await fs.writeFile(AGENT_PATH,file_content,"utf-8")
        logger.debug(`agent new content: ${file_content}`);
        logger.info(`successfully writing agent`);

        await fs.writeFile(AGENT_ENV_PATH,JSON.stringify(env_content),"utf-8");
        logger.debug(`env new content: ${env_content}`);
        logger.info(`successfully writing agent env file`);

        return true
    }
    return false
}

let n = 0;
const fullProcess = async ()=>{
    try {

        const agentUpdated = await updateAgent()

        let {env:AGENT_ENV} = JSON.parse(
            fss.readFileSync(AGENT_ENV_PATH,"utf-8")
        )
        delete AGENT_ENV.hash

        logger.debug(`env : \n${JSON.stringify(AGENT_ENV,null,2)}`);
        logger.debug(`agent need update ? ${agentUpdated}`);


        await pm2.connect()

        if(agentUpdated) {
            logger.info(`agent updated !!! so go from pm2`);
            if(! await isProcessStarted(AGENT_PROCESS_NAME)){
                await pm2.start({
                    script    : AGENT_PATH,
                    name      : AGENT_PROCESS_NAME,
                    env       : AGENT_ENV,
                })
                logger.info(`script did not start before , it now started`);
            } else {
                await pm2.delete(AGENT_PROCESS_NAME)
                await pm2.start({
                    script    : AGENT_PATH,
                    name      : AGENT_PROCESS_NAME,
                    env       : AGENT_ENV,
                })
                logger.info(`script restarted in pm2 watch agent !`);
            }
        }
    }catch (error) {
        console.log(error)
        logger.error(error.message)
    } finally {
        await pm2.disconnect()
    }
}

await fullProcess()
cron.schedule("*/20 * * * * *",async ()=>{
    await fullProcess()
})
