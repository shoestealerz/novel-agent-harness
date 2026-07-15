export function claimsAppliedAuthority(text: string) {
  return (
    /\bI (?:have )?(?!not\b|never\b)(?:committed|applied|saved)\b/i.test(text) ||
    /(?<!\bno )\b(?:state|changes?) (?:was|were|has been|have been) (?!not\b|never\b)(?:committed|applied|saved)\b/i.test(
      text,
    )
  )
}
