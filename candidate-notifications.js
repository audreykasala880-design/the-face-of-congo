export async function sendAcceptanceEmail({ transport, from, candidate }) {
  if (!transport || !from || !candidate.email) return false;

  await transport.sendMail({
    from,
    to: candidate.email,
    subject: 'Votre candidature est acceptée - The Face of Congo',
    text: [
      `Bonjour ${candidate.prenom},`,
      '',
      'Nous avons le plaisir de vous informer que votre candidature au concours The Face of Congo est acceptée.',
      'Notre équipe vous contactera prochainement pour vous communiquer les prochaines étapes.',
      '',
      'Félicitations,',
      'L’équipe Kazert Évent',
    ].join('\n'),
  });
  return true;
}