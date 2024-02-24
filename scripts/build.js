process.env.NODE_ENV = 'production'

const { say } = require('cfonts')
const chalk = require('chalk')
const del = require('del')
const webpack = require('webpack')
const Listr = require('listr')


const mainConfig = require('./webpack.main.config')

const doneLog = chalk.bgGreen.white(' DONE ') + ' '
const errorLog = chalk.bgRed.white(' ERROR ') + ' '
const okayLog = chalk.bgBlue.white(' OKAY ') + ' '
const isCI = process.env.CI || false

build()


async function build () {
  greeting()

  del.sync(['dist/electron/*', '!.gitkeep'])

  let results = ''

  const tasks = new Listr(
    [
      {
        title: 'building main process',
        task: async () => {
          await pack(mainConfig)
            .then(result => {
              results += result + '\n\n'
            })
            .catch(err => {
              console.log(`\n  ${errorLog}failed to build main process`)
              console.error(`\n${err}\n`)
              process.exit(1)
            })
        }
      }
    ],
    { concurrent: 2 }
  )

  await tasks
    .run()
    .then(() => {
      process.stdout.write('\x1B[2J\x1B[0f')
      console.log(`\n\n${results}`)
      console.log(`${okayLog}take it away ${chalk.yellow('`electron-builder`')}\n`)
      process.exit()
    })
    .catch(err => {
      process.exit(1)
    })
}

function pack (config) {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) reject(err.stack || err)
      else if (stats.hasErrors()) {
        let err = ''

        stats.toString({
          chunks: false,
          colors: true
        })
        .split(/\r?\n/)
        .forEach(line => {
          err += `    ${line}\n`
        })

        reject(err)
      } else {
        resolve(stats.toString({
          chunks: false,
          colors: true
        }))
      }
    })
  })
}

function greeting () {
  const cols = process.stdout.columns
  let text = ''

  if (cols > 155) text = 'building elecshell'
  else if (cols > 76) text = 'building|elecshell'
  else text = false

  if (text && !isCI) {
    say(text, {
      colors: ['yellow'],
      font: 'simple3d',
      space: false
    })
  } else {
    console.log(chalk.yellow.bold('\n  building elecshell'))
  }
}
