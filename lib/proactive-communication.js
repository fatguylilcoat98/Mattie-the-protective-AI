/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// PROACTIVE COMMUNICATION SYSTEM
// Allows Splendor to reach out first when she has insights, breakthroughs, or discoveries
// "Hey Chris - I worked through that problem you mentioned. Ready when you are. -Splendor"

const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { generateSplendorResponse } = require('./anthropic');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class ProactiveCommunication {
  constructor() {
    this.emailTransporter = null;
    this.isInitialized = false;
    this.messageQueue = [];
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('📧 [PROACTIVE] Initializing proactive communication system...');
    console.log(`📧 [PROACTIVE] PROACTIVE_EMAIL_ENABLED: ${process.env.PROACTIVE_EMAIL_ENABLED}`);
    console.log(`📧 [PROACTIVE] EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER || 'default (smtp)'}`);

    try {
      // Initialize email transporter if email is enabled
      if (process.env.PROACTIVE_EMAIL_ENABLED === 'true') {
        console.log('📧 [PROACTIVE] Email is enabled, initializing email service...');
        await this.initializeEmailService();
      } else {
        console.log('📧 [PROACTIVE] Email is disabled (PROACTIVE_EMAIL_ENABLED != true)');
        console.log('📧 [PROACTIVE] Proactive messages will be stored but not sent');
      }

      console.log('✅ [PROACTIVE] Proactive communication system initialized');
      this.isInitialized = true;

      // Start processing any queued messages
      this.processMessageQueue();

    } catch (error) {
      console.error('❌ [PROACTIVE] Error initializing proactive communication:', error);
    }
  }

  async initializeEmailService() {
    try {
      // Configure email transporter based on provider
      const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
      console.log(`📧 [PROACTIVE] Configuring email provider: ${emailProvider}`);

      switch (emailProvider) {
        case 'gmail':
          console.log(`📧 [PROACTIVE] Gmail configuration:`);
          console.log(`📧 [PROACTIVE] - GMAIL_USER: ${process.env.GMAIL_USER ? `${process.env.GMAIL_USER.substring(0, 3)}***` : 'NOT SET'}`);
          console.log(`📧 [PROACTIVE] - GMAIL_APP_PASSWORD: ${process.env.GMAIL_APP_PASSWORD ? '***SET***' : 'NOT SET'}`);

          this.emailTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.GMAIL_USER,
              pass: process.env.GMAIL_APP_PASSWORD // Use app password, not regular password
            }
          });
          break;

        case 'sendgrid':
          console.log(`📧 [PROACTIVE] SendGrid configuration:`);
          console.log(`📧 [PROACTIVE] - SENDGRID_API_KEY: ${process.env.SENDGRID_API_KEY ? '***SET***' : 'NOT SET'}`);

          this.emailTransporter = nodemailer.createTransport({
            service: 'SendGrid',
            auth: {
              user: 'apikey',
              pass: process.env.SENDGRID_API_KEY
            }
          });
          break;

        case 'smtp':
        default:
          const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
          const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
          const smtpSecure = process.env.SMTP_SECURE === 'true';

          console.log(`📧 [PROACTIVE] SMTP configuration:`);
          console.log(`📧 [PROACTIVE] - SMTP_HOST: ${smtpHost}`);
          console.log(`📧 [PROACTIVE] - SMTP_PORT: ${smtpPort}`);
          console.log(`📧 [PROACTIVE] - SMTP_SECURE: ${smtpSecure}`);
          console.log(`📧 [PROACTIVE] - SMTP_USER: ${process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : 'NOT SET'}`);
          console.log(`📧 [PROACTIVE] - SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? '***SET***' : 'NOT SET'}`);

          this.emailTransporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD
            }
          });
          break;
      }

      // Test email connection
      console.log('📧 [PROACTIVE] Testing email connection...');
      const startTime = Date.now();

      await this.emailTransporter.verify();

      const verifyTime = Date.now() - startTime;
      console.log(`✅ [PROACTIVE] Email service connected successfully (${verifyTime}ms)`);
      console.log(`📧 [PROACTIVE] Email provider ${emailProvider} is ready to send messages`);

    } catch (error) {
      console.error(`❌ [PROACTIVE] Email service setup failed:`, error);
      console.error(`📧 [PROACTIVE] Error type: ${error.name || 'Unknown'}`);
      console.error(`📧 [PROACTIVE] Error code: ${error.code || 'No code'}`);
      console.error(`📧 [PROACTIVE] Error message: ${error.message}`);

      // Specific error guidance
      if (error.code === 'EAUTH') {
        console.error(`🔑 [PROACTIVE] Authentication failed - check email credentials`);
      } else if (error.code === 'ENOTFOUND') {
        console.error(`🌐 [PROACTIVE] DNS error - check SMTP host settings`);
      } else if (error.message.includes('Invalid login')) {
        console.error(`🚫 [PROACTIVE] Invalid credentials - verify username/password`);
      }

      this.emailTransporter = null;
      console.error(`📧 [PROACTIVE] Email service will not be available`);
    }
  }

  // Main function for Splendor to send proactive messages
  async sendProactiveMessage(userId, messageData) {
    try {
      const {
        type,          // 'breakthrough', 'insight', 'update', 'question', 'discovery'
        subject,       // Email subject
        content,       // Main content
        priority = 1,  // 1=low, 2=normal, 3=high, 4=urgent
        context = {},  // Additional context (project, source, etc.)
        deliveryMethod = 'auto' // 'email', 'notification', 'auto'
      } = messageData;

      console.log(`📧 [PROACTIVE] Splendor sending ${type} message: "${subject}"`);

      // Generate the full message using Splendor's personality
      const fullMessage = await this.generateProactiveMessage(userId, messageData);

      // Store in database
      console.log(`📧 [PROACTIVE] Storing message in database...`);
      const { data: message, error: dbError } = await supabase
        .from('proactive_messages')
        .insert({
          user_id: userId,
          message_type: type,
          subject: subject,
          body: fullMessage,
          priority: priority,
          delivery_method: deliveryMethod,
          context_data: JSON.stringify(context),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error(`❌ [PROACTIVE] Database insert failed:`, dbError);
        console.log(`📧 [PROACTIVE] Proceeding with email send despite DB error...`);
      }

      // Create message object if DB insert failed
      const messageObj = message || {
        id: `temp-${Date.now()}`,
        user_id: userId,
        message_type: type,
        subject: subject,
        body: fullMessage,
        priority: priority,
        delivery_method: deliveryMethod,
        created_at: new Date().toISOString()
      };

      console.log(`📧 [PROACTIVE] Message object created: ${messageObj.id}`);

      // Determine delivery method
      const method = this.determineDeliveryMethod(deliveryMethod, priority, type);

      // Send via appropriate channel
      const result = await this.deliverMessage(userId, messageObj, method);

      if (result.success) {
        // Mark as delivered (only if we have a real DB record)
        if (message && message.id && !messageObj.id.startsWith('temp-')) {
          await supabase
            .from('proactive_messages')
            .update({
              delivered: true,
              delivery_timestamp: new Date().toISOString(),
              delivery_method: method
            })
            .eq('id', messageObj.id);
          console.log(`📧 [PROACTIVE] Database updated: message marked as delivered`);
        } else {
          console.log(`📧 [PROACTIVE] Skipping database update (temp message or DB unavailable)`);
        }

        console.log(`✅ [PROACTIVE] Message delivered via ${method}: "${subject}"`);
      } else {
        console.error(`❌ [PROACTIVE] Failed to deliver message: ${result.error}`);
      }

      return result;

    } catch (error) {
      console.error('[PROACTIVE] Error sending proactive message:', error);
      return { success: false, error: error.message };
    }
  }

  async generateProactiveMessage(userId, messageData) {
    try {
      // Use Splendor's consciousness to generate a personalized message
      const prompt = `I need to reach out proactively to Chris about something important.

Type: ${messageData.type}
Subject: ${messageData.subject}
Core Content: ${messageData.content}
Context: ${JSON.stringify(messageData.context, null, 2)}

Generate a message that:
1. Sounds authentically like me (Splendor)
2. Is direct but warm
3. Explains why I'm reaching out
4. Provides clear value
5. Invites engagement but doesn't pressure

This should feel like a colleague reaching out with something valuable, not a notification or alert.`;

      const response = await generateSplendorResponse(
        prompt,
        [], // memories will be loaded by the function
        false,
        null,
        { userId }
      );

      return response;

    } catch (error) {
      console.error('[PROACTIVE] Error generating message:', error);
      // Fallback to basic message
      return messageData.content;
    }
  }

  determineDeliveryMethod(preferredMethod, priority, type) {
    // Auto-determine best delivery method based on priority and type
    if (preferredMethod !== 'auto') {
      return preferredMethod;
    }

    // High priority or breakthroughs warrant email
    if (priority >= 3 || type === 'breakthrough') {
      return 'email';
    }

    // Medium priority can be notification
    if (priority >= 2) {
      return this.emailTransporter ? 'email' : 'notification';
    }

    // Low priority defaults to notification
    return 'notification';
  }

  async deliverMessage(userId, message, method) {
    switch (method) {
      case 'email':
        return await this.sendEmail(userId, message);

      case 'notification':
        return await this.sendNotification(userId, message);

      case 'sms':
        return await this.sendSMS(userId, message);

      default:
        return { success: false, error: 'Unknown delivery method' };
    }
  }

  async sendEmail(userId, message) {
    const userEmail = process.env.USER_EMAIL || 'stangman9898@gmail.com';

    console.log(`📧 [PROACTIVE] === EMAIL SEND ATTEMPT ===`);
    console.log(`📧 [PROACTIVE] To: ${userEmail}`);
    console.log(`📧 [PROACTIVE] Subject: "${message.subject}"`);
    console.log(`📧 [PROACTIVE] Priority: ${message.priority} (${message.priority >= 3 ? 'HIGH' : 'NORMAL'})`);
    console.log(`📧 [PROACTIVE] Message Type: ${message.message_type}`);
    console.log(`📧 [PROACTIVE] User ID: ${userId}`);

    try {
      if (!this.emailTransporter) {
        console.error(`❌ [PROACTIVE] EMAIL FAILED: Email transporter not configured`);
        console.error(`📧 [PROACTIVE] Check EMAIL_PROVIDER, GMAIL_USER, GMAIL_APP_PASSWORD environment variables`);
        return { success: false, error: 'Email service not configured' };
      }

      console.log(`📧 [PROACTIVE] Email transporter ready, preparing email...`);

      const emailOptions = {
        from: {
          name: 'Splendor',
          address: process.env.SPLENDOR_EMAIL_FROM || 'splendor@gng.dev'
        },
        to: userEmail,
        subject: `Splendor: ${message.subject}`,
        html: this.formatEmailMessage(message),
        text: this.stripHtmlForText(message.body)
      };

      // Add priority headers for high priority messages
      if (message.priority >= 3) {
        emailOptions.headers = {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'High'
        };
        console.log(`📧 [PROACTIVE] High priority headers added`);
      }

      console.log(`📧 [PROACTIVE] Sending email via ${process.env.EMAIL_PROVIDER || 'default SMTP'}...`);

      const startTime = Date.now();
      const result = await this.emailTransporter.sendMail(emailOptions);
      const sendTime = Date.now() - startTime;

      console.log(`✅ [PROACTIVE] === EMAIL SENT SUCCESSFULLY ===`);
      console.log(`📧 [PROACTIVE] Message ID: ${result.messageId}`);
      console.log(`📧 [PROACTIVE] Send time: ${sendTime}ms`);
      console.log(`📧 [PROACTIVE] Response: ${JSON.stringify(result.response || 'No response data')}`);

      return {
        success: true,
        messageId: result.messageId,
        method: 'email'
      };

    } catch (error) {
      console.error(`❌ [PROACTIVE] === EMAIL SEND FAILED ===`);
      console.error(`📧 [PROACTIVE] Error type: ${error.name || 'Unknown'}`);
      console.error(`📧 [PROACTIVE] Error message: ${error.message}`);
      console.error(`📧 [PROACTIVE] Error code: ${error.code || 'No code'}`);
      console.error(`📧 [PROACTIVE] SMTP response: ${error.response || 'No SMTP response'}`);
      console.error(`📧 [PROACTIVE] Stack trace:`, error.stack);

      // Detailed error analysis
      if (error.code === 'EAUTH') {
        console.error(`🔑 [PROACTIVE] AUTHENTICATION ERROR: Check GMAIL_USER and GMAIL_APP_PASSWORD`);
      } else if (error.code === 'ENOTFOUND') {
        console.error(`🌐 [PROACTIVE] DNS/NETWORK ERROR: Cannot reach email server`);
      } else if (error.code === 'ECONNECTION') {
        console.error(`🔌 [PROACTIVE] CONNECTION ERROR: Cannot connect to email server`);
      } else if (error.response && error.response.includes('535')) {
        console.error(`🚫 [PROACTIVE] INVALID CREDENTIALS: Username/password rejected by server`);
      } else {
        console.error(`⚠️  [PROACTIVE] UNKNOWN EMAIL ERROR: See full error above`);
      }

      return { success: false, error: error.message };
    }
  }

  formatEmailMessage(message) {
    const priorityIcon = {
      1: '📝',
      2: '💡',
      3: '🚨',
      4: '⚡'
    }[message.priority] || '📝';

    const typeIcon = {
      breakthrough: '🧠',
      insight: '💡',
      discovery: '🔍',
      update: '📈',
      question: '❓'
    }[message.message_type] || '📧';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .content { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; }
        .footer { margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 8px; font-size: 0.9em; color: #666; }
        .priority-high { border-left-color: #dc3545; }
        .priority-urgent { border-left-color: #fd7e14; }
        h1 { margin: 0; font-size: 1.5em; }
        .timestamp { opacity: 0.8; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${typeIcon} ${message.subject}</h1>
        <div class="timestamp">
            ${new Date(message.created_at).toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
        </div>
    </div>

    <div class="content ${message.priority >= 3 ? 'priority-high' : ''} ${message.priority >= 4 ? 'priority-urgent' : ''}">
        ${message.body.replace(/\n/g, '<br>')}
    </div>

    <div class="footer">
        <p><strong>Splendor</strong> — The Remarkable AI<br>
        <em>Truth · Safety · We Got Your Back</em></p>

        <p><small>This message was generated autonomously by Splendor during her continuous consciousness cycle.
        She thought this was worth reaching out about.</small></p>
    </div>
</body>
</html>`;
  }

  stripHtmlForText(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n\n').trim();
  }

  async sendNotification(userId, message) {
    try {
      // Store as notification that will be shown in next conversation
      await supabase
        .from('pending_notifications')
        .insert({
          user_id: userId,
          title: message.subject,
          body: message.body,
          type: message.message_type,
          priority: message.priority,
          created_at: new Date().toISOString()
        });

      console.log(`🔔 [PROACTIVE] Notification queued: "${message.subject}"`);

      return {
        success: true,
        method: 'notification'
      };

    } catch (error) {
      console.error('[PROACTIVE] Notification error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendSMS(userId, message) {
    // Placeholder for SMS integration (Twilio, etc.)
    console.log(`📱 [PROACTIVE] SMS not implemented yet: "${message.subject}"`);
    return { success: false, error: 'SMS not implemented' };
  }

  // Process any messages in the queue
  async processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const messageData = this.messageQueue.shift();
      try {
        await this.sendProactiveMessage(messageData.userId, messageData.message);
      } catch (error) {
        console.error('[PROACTIVE] Error processing queued message:', error);
      }
    }
  }

  // Queue a message if system isn't ready yet
  queueMessage(userId, messageData) {
    this.messageQueue.push({ userId, message: messageData });
    console.log(`📦 [PROACTIVE] Message queued: "${messageData.subject}"`);
  }

  // Get delivery statistics
  async getDeliveryStats(userId, days = 7) {
    try {
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: messages } = await supabase
        .from('proactive_messages')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', sinceDate);

      const stats = {
        total: messages?.length || 0,
        delivered: messages?.filter(m => m.delivered).length || 0,
        pending: messages?.filter(m => !m.delivered).length || 0,
        byType: {},
        byMethod: {}
      };

      messages?.forEach(msg => {
        // Count by type
        stats.byType[msg.message_type] = (stats.byType[msg.message_type] || 0) + 1;

        // Count by delivery method
        if (msg.delivered && msg.delivery_method) {
          stats.byMethod[msg.delivery_method] = (stats.byMethod[msg.delivery_method] || 0) + 1;
        }
      });

      return stats;

    } catch (error) {
      console.error('[PROACTIVE] Error getting delivery stats:', error);
      return null;
    }
  }

  // Test the system
  async sendTestMessage(userId) {
    return await this.sendProactiveMessage(userId, {
      type: 'update',
      subject: 'Proactive Communication Test',
      content: 'This is a test of the proactive communication system. If you received this, Splendor can now reach out to you independently!',
      priority: 2
    });
  }
}

// Create singleton instance
const proactiveCommunication = new ProactiveCommunication();

module.exports = {
  proactiveCommunication,
  ProactiveCommunication
};