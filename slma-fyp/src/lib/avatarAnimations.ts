export interface AvatarResponseOption {
  key: string;
  label: string;
  doctorText: string;
  fileName: string;
  assetLabel: string;
}

export const AVATAR_HELLO_RESPONSE: AvatarResponseOption = {
  key: "hello",
  label: "hello",
  doctorText: "Hello.",
  fileName: "hello.glb",
  assetLabel: "hello",
};

export const AVATAR_IDLE_RESPONSE: AvatarResponseOption = {
  key: "stand_still",
  label: "stand still",
  doctorText: "",
  fileName: "stand still.glb",
  assetLabel: "stand still",
};

export const AVATAR_RESPONSES: AvatarResponseOption[] = [
  {
    key: "are_you_alright",
    label: "are you alright",
    doctorText: "Are you alright?",
    fileName: "are you alright.glb",
    assetLabel: "are you alright",
  },
  {
    key: "are_you_hurt",
    label: "are you hurt",
    doctorText: "Are you hurt?",
    fileName: "are you hurt.glb",
    assetLabel: "are you hurt",
  },
  {
    key: "do_you_feel_dizzy",
    label: "do you feel dizzy",
    doctorText: "Do you feel dizzy?",
    fileName: "do you feel dizzy.glb",
    assetLabel: "do you feel dizzy",
  },
  {
    key: "do_you_feel_vomit",
    label: "do you feel vomit",
    doctorText: "Do you feel like vomiting?",
    fileName: "do you feel vomit.glb",
    assetLabel: "do you feel vomit",
  },
  {
    key: "do_you_fell_headache",
    label: "do you fell headache",
    doctorText: "Do you feel headache?",
    fileName: "do you fell headache.glb",
    assetLabel: "do you fell headache",
  },
  {
    key: "does_your_stomach_hurt",
    label: "does your stomach hurt",
    doctorText: "Does your stomach hurt?",
    fileName: "does your stomach hurt.glb",
    assetLabel: "does your stomach hurt",
  },
  {
    key: "have_you_fever",
    label: "have you fever",
    doctorText: "Do you have fever?",
    fileName: "have you fever.glb",
    assetLabel: "have you fever",
  },
  {
    key: "where_you_hurt",
    label: "where you hurt",
    doctorText: "Where are you hurt?",
    fileName: "where you hurt.glb",
    assetLabel: "where you hurt",
  },
  {
    key: "you_have_cough",
    label: "you have cough",
    doctorText: "Do you have cough?",
    fileName: "you have cough.glb",
    assetLabel: "you have cough",
  },
  {
    key: "you_need_help",
    label: "you need help",
    doctorText: "Do you need help?",
    fileName: "you need help.glb",
    assetLabel: "you need help",
  },
];

const avatarAliases: Record<string, string> = {
  greeting: "are_you_alright",
  repeat_sign: "are_you_alright",
  describe_problem: "do_you_feel_dizzy",
  feeling_pain: "are_you_hurt",
  where_pain: "where_you_hurt",
  please_wait: "have_you_fever",
  take_medicine: "you_have_cough",
  go_hospital: "does_your_stomach_hurt",
  emergency_help: "you_need_help",
  thank_you: "do_you_feel_vomit",
};

export const AVATAR_RESPONSE_BY_KEY = AVATAR_RESPONSES.reduce<Record<string, AvatarResponseOption>>(
  (lookup, response) => {
    lookup[response.key] = response;
    return lookup;
  },
  {},
);

Object.entries(avatarAliases).forEach(([oldKey, newKey]) => {
  const response = AVATAR_RESPONSE_BY_KEY[newKey];
  if (response) AVATAR_RESPONSE_BY_KEY[oldKey] = response;
});

export function getAvatarAssetUrl(fileName?: string) {
  if (!fileName) return "";
  return `/avatar/${encodeURIComponent(fileName)}`;
}
