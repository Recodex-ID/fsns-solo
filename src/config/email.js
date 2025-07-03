const nodemailer = require('nodemailer')
const logger = require('./logger')

const createTransporter = () => {
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  })

  return transporter
}

const sendEmail = async (options) => {
  try {
    const transporter = createTransporter()

    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    }

    const info = await transporter.sendMail(mailOptions)
    logger.info(`Email sent: ${info.messageId}`)
    return info
  } catch (error) {
    logger.error('Email sending failed:', error.message)
    throw error
  }
}

module.exports = { sendEmail }