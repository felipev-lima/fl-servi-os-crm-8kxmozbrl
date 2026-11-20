// Icone "FL" 180x180 em PNG, embutido em base64 (o iPhone exige PNG no atalho,
// nao aceita SVG). Quebrado em blocos curtos de proposito: uma linha unica
// longa e truncada pelo canal de escrita do projeto.
// O quadradinho do icone usa "FL" sem pontos (mais legivel no tamanho pequeno);
// o nome completo "F. L. SERVIÇOS" aparece ao lado, no texto.
const PARTES = [
  'iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAAADn0lEQVR4nO3d' +
    'P24cdQCG4VmLBgkRCmqOwAGCRAklDS09CqJAoqCCM1Bg5QyIO1Dhg9BQIWGE' +
    'RAOEKpGTeP+MZ2Z39t3n6b0zK7358ovH3myGI3r05PGzY16P9bi9vtkc4zqL' +
    'XkTAbLNU4LO/qIgZa864Z3shITPVHGFPfgEhM7cpYV9NubCYWcKUrh70J0HI' +
    'HMvYtR690GLmmMb2NipoMXMKY7o7OGgxc0qH9ndQ0GJmDQ7pcG/QYmZN9vW4' +
    'M2gxs0a7utwatJhZs219TnqwAmtzb9DWmXNwX6evBS1mzsmrvTpykPJS0NaZ' +
    'c3S3WwtNyougrTPn7Hm/FpoUQZOyGQbHDTosNCmCJkXQpFw5P1NioUkRNCmC' +
    'JkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQ' +
    'pAiaFEGTImhS3jj1DYzx1UefDd998vmpb2Ov97/9dPj1999Gf92U9/fn338N' +
    '73398YO+tsRCkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUs7q0fcUHg1fBgtN' +
    'iqBJETQpgiZF0KQImhRBkyJoUgRNiqBJETQpF/OzHG+/+dbwxw+/LHqNpz//' +
    'OHzz0/eLXoPdLDQpgiZF0KQImhRBkyJoUgRNiqBJETQpgiblYh59+xiDy2Ch' +
    'SRE0KYImRdCkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZNyMT8+WneMT4a6' +
    '690vPxz++e/fo13vUBaaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTsnn05PGz' +
    'U98EzMVCkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJETQpPmhmGI76' +
    'AS1Le+eLD059Cyd18QtdinkYeu9nrIsPmhZBk3LxQdfOnLX3M5ZfwSLl4hea' +
    'FkGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGT' +
    'ImhSBE2KoEkRNCmCJuXq9vpmc+qbgLlYaFIETYqgSbkahmFwjqbg9vpmY6FJ' +
    'ETQpL4J27OCcPe/XQpPyUtBWmnN0t1sLTcprQVtpzsmrvd670KLmHNzXqSMH' +
    'KVuDttKs2bY+dy60qFmjXV3uPXKImjXZ1+NBZ2hRswaHdHjwPwpFzSkd2t+o' +
    '73KImlMY093ob9uJmmMa29ukOP3H9yzlocM56cGKtWYJU7qaLUhrzVRzDOTs' +
    'Cytsxprzb/pFjwziZpuljqv/A407v8zP+sgEAAAAAElFTkSuQmCC',
]

/** Data-URI do icone FL, pronto para o <link rel="apple-touch-icon">. */
export const ICONE_FL = 'data:image/png;base64,' + PARTES.join('')
