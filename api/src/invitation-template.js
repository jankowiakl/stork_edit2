export const INVITATION_SUBJECT_MAX_LENGTH=200;
export const INVITATION_BODY_MAX_LENGTH=10000;
export const INVITATION_PLACEHOLDERS=Object.freeze([
  "name","email","role","appUrl","temporaryPassword","permissions","accessDescription"
]);

export const DEFAULT_INVITATION_SUBJECT="Zaproszenie do Stork Photo Editor";
export const DEFAULT_INVITATION_BODY=[
  "Witaj {{name}},",
  "",
  "Masz konto w aplikacji Stork Photo Editor.",
  "",
  "Aplikacja: {{appUrl}}",
  "Email: {{email}}",
  "Twoja rola: {{role}}.",
  "Uprawnienia: {{permissions}}{{accessDescription}}",
  "",
  "Hasło tymczasowe: {{temporaryPassword}}",
  "",
  "Po pierwszym logowaniu trzeba zmienić hasło.",
  "",
  "Instrukcja:",
  "1. Otwórz aplikację.",
  "2. Zaloguj się emailem i hasłem tymczasowym.",
  "3. Ustaw własne hasło.",
  "4. Rozpocznij pracę z przydzielonymi zdjęciami.",
  "",
  "Stork Photo Editor"
].join("\n");

const placeholderPattern=/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g;

export function validateInvitationTemplate(subjectTemplate,bodyTemplate){
  const subject=String(subjectTemplate??""),body=String(bodyTemplate??"");
  if(!subject.trim()||subject.length>INVITATION_SUBJECT_MAX_LENGTH||/[\r\n\0]/.test(subject))throw new Error("invalid_invitation_subject_template");
  if(!body.trim()||body.length>INVITATION_BODY_MAX_LENGTH||body.includes("\0"))throw new Error("invalid_invitation_body_template");
  const matches=[...subject.matchAll(placeholderPattern),...body.matchAll(placeholderPattern)];
  for(const match of matches){
    if(!INVITATION_PLACEHOLDERS.includes(match[1]))throw new Error("invalid_invitation_placeholder");
  }
  const unresolved=[...subject.matchAll(/{{|}}/g),...body.matchAll(/{{|}}/g)];
  if(unresolved.length!==matches.length*2)throw new Error("invalid_invitation_placeholder");
  return{subjectTemplate:subject.trim(),bodyTemplate:body};
}

export function generateInvitationMessage({subjectTemplate,bodyTemplate},values){
  const template=validateInvitationTemplate(subjectTemplate,bodyTemplate);
  const substitute=(text)=>text.replace(placeholderPattern,(_whole,key)=>String(values?.[key]??""));
  return{subject:substitute(template.subjectTemplate),body:substitute(template.bodyTemplate)};
}

export function invitationFallbackUrls({email,subject,body}){
  const gmailParams=new URLSearchParams({view:"cm",fs:"1",to:String(email),su:subject,body});
  return{
    gmailUrl:`https://mail.google.com/mail/?${gmailParams}`,
    mailtoUrl:`mailto:${encodeURIComponent(String(email))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  };
}
