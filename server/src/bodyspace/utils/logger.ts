import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const transport = isProd
    ? undefined
    : pino.transport({
          target: 'pino-pretty',
          options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
          },
      });

export const logger = pino(
    {
        level: process.env.LOG_LEVEL ?? 'info',
        base: undefined,
        redact: {
            paths: ['*.token', '*.apiKey', 'authorization', 'headers.authorization', 'req.headers.authorization'],
            censor: '[REDACTED]',
        },
    },
    transport
);

export function getAgentLogger(agent: string) {
    return logger.child({ agent });
}
