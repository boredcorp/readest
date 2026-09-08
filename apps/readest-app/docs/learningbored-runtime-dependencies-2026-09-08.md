# LearningBored web runtime dependency correction

The exact private-beta Reader image built from integration revision `9db2486773f90edd31e659262cc32519dfa036da`
passed its startup and capability-profile gates, then reported 14 HIGH findings in Next.js 16.2.3,
React Server DOM Webpack 19.2.5 and sharp 0.34.5. Its minimal OS runtime had no HIGH/CRITICAL findings.

Pin Next.js to 16.2.11 and React, React DOM and React Server DOM Webpack to 19.2.8. Override sharp to
0.35.0 so Next's transitive image dependency also resolves the patched libvips distribution. Regenerate
the pnpm 10.33.0 lockfile; its changed native and peer entries belong to these dependency families.
The application integration, permanent-upload fence, private-beta restrictions and submodule gitlinks
remain unchanged. LearningBored records the new Reader commit in its own versioned release; this
integration patch does not publish native Readest packages.

The matching upstream security fixes are documented by [Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-6gpp-xcg3-4w24),
[React](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g) and
[sharp](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj).

The frozen lockfile consistency check passes. Actual Reader cold-build, startup, capability-profile,
vulnerability and source-bound image checks must pass before release, followed by the required
LearningBored web release aggregate and signatures. No finding is suppressed or removed from scanner
metadata, and no local check is presented as a GitHub Actions result.
