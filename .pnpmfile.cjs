// TypeScript 7 has no compiler API; ESLint's TypeScript plugins still need version 6.
module.exports = {
    hooks: {
        readPackage(pkg) {
            if (
                (pkg.name === 'typescript-eslint' || pkg.name.startsWith('@typescript-eslint/')) &&
                pkg.peerDependencies?.typescript
            ) {
                delete pkg.peerDependencies.typescript;
                pkg.dependencies = { ...pkg.dependencies, typescript: '6.0.3' };
            }
            return pkg;
        },
    },
};
