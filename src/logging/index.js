import winston from "winston";
import {DateTime} from "luxon"

const NODE_ENV =  process.env.NODE_ENV;

let alignColorsAndTime = winston.format.combine(
    winston.format.colorize({
        all:true
    }),
    winston.format.label({
        label:'[LOG]'
    }),
    winston.format.timestamp({
        format: ()=>DateTime.now().reconfigure({outputCalendar: "persian" }).toFormat("yyyy/MM/dd HH:mm =>"),
    }),
    winston.format.printf(
        info => ` ${info.label}  ${info.timestamp}  ${info.level} : ${info.message}`
    )
);

const logger = winston.createLogger({
    level: ( NODE_ENV==="development" ? "debug" : "info" ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), alignColorsAndTime)
        })
    ]
});

// logger.info('What rolls down stairs');
// logger.warn('Whats great for a snack,');
// logger.info('And fits on your back?');
// logger.error('Its log, log, log');
// logger.debug()
export default logger