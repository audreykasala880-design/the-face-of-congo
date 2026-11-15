import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAcceptanceEmail, getMailSender, createMailTransport } from './candidate-notifications.js';

test('résout correctement l’adresse d’expéditeur selon l’environnement', () => {
  assert.equal(getMailSender({ SMTP_FROM: 'custom@example.com' }), 'custom@example.com');
  assert.equal(
    getMailSender({ SMTP_FROM_NAME: 'The Face of Congo', SMTP_FROM_EMAIL: 'theface@gmail.cd' }),
    '"The Face of Congo" <theface@gmail.cd>',
  );
  assert.equal(
    getMailSender({ SMTP_FROM_NAME: 'The Face of Congo', SMTP_USER: 'admin@gmail.com' }),
    '"The Face of Congo" <admin@gmail.com>',
  );
  assert.equal(getMailSender({ SMTP_USER: 'admin@gmail.com' }), 'admin@gmail.com');
  assert.equal(getMailSender({}), '');
});

test('configure le transport SMTP avec sécurité appropriée selon le port', () => {
  // Sur le port 587 (STARTTLS), force secure à false même si SMTP_SECURE=true était configuré par erreur
  const transport587 = createMailTransport({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'true',
    SMTP_USER: 'user@gmail.com',
    SMTP_PASSWORD: 'secretpassword',
  });
  assert.ok(transport587);
  assert.equal(transport587.options.port, 587);
  assert.equal(transport587.options.secure, false);

  // Sur le port 465 (Direct TLS), secure est à true
  const transport465 = createMailTransport({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_USER: 'user@gmail.com',
    SMTP_PASSWORD: 'secretpassword',
  });
  assert.ok(transport465);
  assert.equal(transport465.options.port, 465);
  assert.equal(transport465.options.secure, true);

  // Sans SMTP_HOST, retourne null
  assert.equal(createMailTransport({}), null);
});

test('envoie le message d’acceptation au courriel du candidat', async () => {
  let message;
  const sent = await sendAcceptanceEmail({
    transport: { async sendMail(value) { message = value; } },
    from: 'concours@example.com',
    candidate: { email: '  candidat@example.com  ', prenom: '  Amina  ' },
  });

  assert.equal(sent, true);
  assert.equal(message.to, 'candidat@example.com');
  assert.match(message.subject, /candidature est acceptée/);
  assert.match(message.text, /Bonjour Amina/);
  assert.match(message.html, /Bonjour Amina/);
});

test('ne prétend pas envoyer un courriel sans SMTP configuré', async () => {
  assert.equal(await sendAcceptanceEmail({
    transport: null,
    from: 'concours@example.com',
    candidate: { email: 'candidat@example.com', prenom: 'Amina' },
  }), false);
});