import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAcceptanceEmail } from './candidate-notifications.js';

test('envoie le message d’acceptation au courriel du candidat', async () => {
  let message;
  const sent = await sendAcceptanceEmail({
    transport: { async sendMail(value) { message = value; } },
    from: 'concours@example.com',
    candidate: { email: 'candidat@example.com', prenom: 'Amina' },
  });

  assert.equal(sent, true);
  assert.equal(message.to, 'candidat@example.com');
  assert.match(message.subject, /candidature est acceptée/);
  assert.match(message.text, /Bonjour Amina/);
});

test('ne prétend pas envoyer un courriel sans SMTP configuré', async () => {
  assert.equal(await sendAcceptanceEmail({
    transport: null,
    from: 'concours@example.com',
    candidate: { email: 'candidat@example.com', prenom: 'Amina' },
  }), false);
});