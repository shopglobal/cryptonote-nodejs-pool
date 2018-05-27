/**
 * Cryptonote Node.JS Pool
 * https://github.com/shoppglobal/cryptonote-nodejs-pool
 *
 * Telegram bot
 *
 * Portions Authored by: Daniel Vandal
 * Portions Authored by: Mark Allen Evans (shopglobal)
 **/

// Load required modules
process.env.NTBA_FIX_319 = 1;
var TelegramBot = require('node-telegram-bot-api');

var timeAgo = require('time-ago');

var apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet, config.api);
var notifications = require('./notifications.js');
var utils = require('./utils.js');

// Initialize log system
var logSystem = 'telegramBot';
require('./exceptionWriter.js')(logSystem);

/**
 * Check telegram configuration
 **/

// Check bot settings
if (!config.telegram) {
    log('error', logSystem, 'Telegram is not enabled');
}
else if (!config.telegram.enabled) {
    log('error', logSystem, 'Telegram is not enabled');
}
else if (!config.telegram.token) {
    log('error', logSystem, 'No telegram token found in configuration');
}

// Bot commands
var botCommands = {
    stats: "/stats",
    enable: "/enable",
    disable: "/disable",
    report: "/report"
}

if (config.telegram.botCommands) {
    Object.assign(botCommands, config.telegram.botCommands);
}

// Telegram channel
var channel = config.telegram.channel.replace(/@/g, '') || '';

// Periodical channel statistics
var periodicalStats = (channel && config.telegram.channelStats && config.telegram.channelStats.enabled)
var statsInterval = (config.telegram.channelStats && config.telegram.channelStats.interval > 0) ? parseInt(config.telegram.channelStats.interval) : 0;
    
/**
 * Initialize new telegram bot
 **/

log('info', logSystem, 'Started');

var token = config.telegram.token;
var bot = new TelegramBot(token, {polling: true});

/**
 * Periodical pool statistics
 **/

if (periodicalStats && statsInterval > 0 && channel) {
    log('info', logSystem, 'Sending pool statistics to telegram channel @%s each %d minutes', [channel, statsInterval]);
    setInterval(function(){ sendPoolStats('@'+channel); }, (statsInterval*60)*1000);
}

/**
 * Handle "/start" or "/help"
 **/
 
bot.onText(new RegExp('^/(start|help)$', 'i'), (msg) => {
    if (msg.from.id != msg.chat.id) return ;

    log('info', logSystem, 'Commands list request from @%s (%s)', [msg.from.username, msg.from.id]);

    var message = 'Hi @' + msg.from.username + ',\n\n' +
                  'Here are the commands you can use:\n' +
                  botCommands['stats'] + ' - Pool statistics\n' +
                  botCommands['enable'] + ' _address_ - Notifications ON\n' +
                  botCommands['disable'] + ' _address_ - Notifications OFF\n\n' +
                  'Thank you!';

    bot.sendMessage(msg.from.id, message, { parse_mode: 'Markdown' });
});

/**
 * Pool statistics
 **/
function sendPoolStats(chatId) {
    apiInterfaces.pool('/stats', function(error, stats) {    
        if (error || !stats) {
            log('error', logSystem, 'Unable to get API data for stats: ' + error);
            return bot.sendMessage(id, 'Unable to get pool statistics. Please retry.');
        }

        var poolHashrate = utils.getReadableHashRate(stats.pool.hashrate);
        var poolMiners = stats.pool.miners || 0;
        var poolWorkers = stats.pool.workers || 0;
        var poolBlocks = stats.pool.totalBlocks || 0;
        var poolLastBlock = (stats.pool.lastBlockFound) ? timeAgo.ago(new Date(parseInt(stats.pool.lastBlockFound))) : 'Never';

        var networkHashrate = utils.getReadableHashRate(stats.network.difficulty / stats.config.coinDifficultyTarget);
        var networkDiff = stats.network.difficulty || 'N/A';
        var networkHeight = stats.network.height || 'N/A';
        var networkLastReward = utils.getReadableCoins(stats.lastblock.reward);
        var networkLastBlock = (stats.lastblock.timestamp) ? timeAgo.ago(new Date(parseInt(stats.lastblock.timestamp * 1000))) : 'Never';

        var currentEffort = stats.pool.roundHashes ? (stats.pool.roundHashes / stats.network.difficulty * 100).toFixed(1) + '%' : '0%';

        var response = '';
        response += '*Pool*\n';
        response += 'Hashrate: ' + poolHashrate + '\n';
        response += 'Connected Miners: ' + poolMiners + '\n';
        response += 'Active Workers: ' + poolWorkers + '\n';
        response += 'Blocks Found: ' + poolBlocks + '\n';
        response += 'Last Block: ' + poolLastBlock + '\n';
        response += 'Current Effort: ' + currentEffort + '\n';
        response += '\n';
        response += '*Network*\n';
        response += 'Hashrate: ' +  networkHashrate + '\n';
        response += 'Difficulty: ' + networkDiff + '\n';
        response += 'Block Height: ' + networkHeight + '\n';
        response += 'Block Found: ' + networkLastBlock + '\n';
        response += 'Last Reward: ' + networkLastReward;

        return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    });
}


bot.onText(new RegExp('^'+botCommands['stats']+'$', 'i'), (msg) => {
    log('info', logSystem, 'Pool statistics request from @%s (%s)', [msg.chat.username, msg.from.id]);
    sendPoolStats(msg.chat.id);
    var address = (match && match[1]) ? match[1].trim() : '';
    if (!address || address == '') {
        return bot.sendMessage(msg.from.id, 'No address specified!');
    }
});

/**
 * Enable miner notifications
 **/
bot.onText(new RegExp('^'+botCommands['enable']+'$', 'i'), (msg) => {
    if (msg.from.id != msg.chat.id) return ;
    return bot.sendMessage(msg.from.id, 'No address specified!');
});
bot.onText(new RegExp('^'+botCommands['enable']+' (.*)$', 'i'), (msg, match) => {
    if (msg.from.id != msg.chat.id) return ;

    var address = (match && match[1]) ? match[1].trim() : '';
    if (!address || address == '') {
        return bot.sendMessage(msg.from.id, 'No address specified!');
    }

    log('info', logSystem, 'Enable miner notifications request from @%s (%s)', [msg.from.username, msg.from.id]);

    var apiRequest = '/set_telegram_notifications?chatId='+msg.from.id+'&address='+address+'&action=enable';
    apiInterfaces.pool(apiRequest, function(error, response) {
        if (error) {            
            log('error', logSystem, 'Unable to enable telegram notifications: ' + error);
            return bot.sendMessage(msg.from.id, 'An error occurred. Please retry.');
        }
        if (response.status != 'done') {
            return bot.sendMessage(msg.from.id, response.status);
        }
        return bot.sendMessage(msg.from.id, 'Notifications enabled for ' + address);
    });
});


/**
 * Report Address miner notifications
 **/
function sendMinerStats(chatId, address) {
 var apiRequest = '/stats_address?address='+address+'&longpoll=true';
    apiInterfaces.pool(apiRequest, function(error, data) {    
        if (error || !data) {
            log('error', logSystem, 'Unable to get API data for stats: ' + error);
            return bot.sendMessage(id, 'Unable to get pool statistics. Please retry.');
        }
        console.log(data.stats.hashes);
        console.log("\n");
        console.log(utils.getReadableHashRate(data.stats.hashrate));
        console.log("\n");
        console.log(utils.getReadableCoins(data.stats.paid));
        console.log("\n");
        console.log(utils.getReadableCoins(data.stats.balance));
        console.log("\n");
        var minerHashrate = utils.getReadableHashRate(data.stats.hashrate);
        var minerHashes = data.stats.hashes;
        var minerPaid = utils.getReadableCoins(data.stats.paid);
        var minerBalance = utils.getReadableCoins(data.stats.balance);
        
        var response = '';
        response += '*My Workers*\n';
//         response += 'Hashrate: ' + minerHashrate + '\n';
//         response += 'Hashes: ' + minerHashes + '\n';
//         response += '\n';
//         response += '*Ledger*\n';
//         response += 'Paid: ' + minerPaid + '\n';
//         response += 'Balance: ' + minerBalance + '\n';
//         response += 'stats: ';
//         response += '\n';
        response += data;

        return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    });
}
var address;
bot.onText(new RegExp('^'+botCommands['report']+'$', 'i'), (msg) => {
    if (msg.from.id != msg.chat.id) return ;
    return bot.sendMessage(msg.from.id, 'No address specified!');
});
bot.onText(new RegExp('^'+botCommands['report']+' (.*)$', 'i'), (msg, match) => {
    if (msg.from.id != msg.chat.id) return ;
    
    var address = (match && match[1]) ? match[1].trim() : '';
    if (!address || address == '') {
        return bot.sendMessage(msg.from.id, 'No address specified!');
    }
    else {
        sendMinerStats(msg.chat.id, address)
    }
    log('info', logSystem, 'Enable miner notifications request from @%s (%s)', [msg.from.username, msg.from.id]);

   
});

/**
 * Disable miner notifications
 **/
bot.onText(new RegExp('^'+botCommands['disable']+'$', 'i'), (msg) => {
    if (msg.from.id != msg.chat.id) return ;
    return bot.sendMessage(msg.from.id, 'No address specified!');
});
bot.onText(new RegExp('^'+botCommands['disable']+' (.*)$', 'i'), (msg, match) => {
    if (msg.from.id != msg.chat.id) return ;

    var address = (match && match[1]) ? match[1].trim() : '';
    if (!address || address == '') {
        return bot.sendMessage(msg.from.id, 'No address specified!');
    }
    
    log('info', logSystem, 'Disable miner notifications request from @%s (%s)', [msg.from.username, msg.from.id]);
    
    var apiRequest = '/set_telegram_notifications?chatId='+msg.from.id+'&address='+address+'&action=disable';
    apiInterfaces.pool(apiRequest, function(error, response) {
        if (error) {            
            log('error', logSystem, 'Unable to disable telegram notifications: ' + error);
            return bot.sendMessage(msg.from.id, 'An error occurred. Please retry.');
        }
        if (response.status != 'done') {
            return bot.sendMessage(msg.from.id, response.status);
        }
        return bot.sendMessage(msg.from.id, 'Notifications disabled for ' + address);
    });
});
