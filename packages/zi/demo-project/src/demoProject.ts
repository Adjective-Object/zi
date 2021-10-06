import { helper } from './helper';

export function main() {
    document.body.innerText = 'the demo project is running!';
    console.log('main - edited in place');
    helper();
}

main();
