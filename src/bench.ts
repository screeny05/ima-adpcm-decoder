export default class Bench {
    ticks = {};

    tick(str: string) {
        if(this.ticks[str]){
            this.ticks[str].start = performance.now();
            this.ticks[str].count += 1;
        } else {
            this.ticks[str] = {
                start: performance.now(),
                total: 0,
                count: 1
            };
        }
    }

    tock(str: string) {
        this.ticks[str].total += performance.now() - this.ticks[str].start;
    }

    tockPrint(str: string) {
        console.log('tick', str, performance.now() - this.ticks[str].start);
    }

    tockAvg(str: string) {
        console.log('tickavg', str, this.ticks[str].total / this.ticks[str].count);
    }

    tockCount(str: string, count: number) {
        this.tock(str);
        this.ticks[str].count = count;
    }
}
