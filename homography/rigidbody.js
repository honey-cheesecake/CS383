// Note: Balls only spawn on the upper 2/3rds of the screen.

// range for initial X velocity on spawn 
const ballVelXMin = 1
const ballVelXMax = 5

// range for initial Y velocity on spawn. Ignored if spawning on the top 1/3rd
const ballVelYMin = 1
const ballVelYMax = 5

// Yet another measure to reduce noise
const epsilon = 2;

class RigidBody {
    pos = createVector(0, 0); // position
    vel = createVector(0, 0); // velocity

    // How big to draw the visuals (the elipse)
    visualRadius = 17;
    // How big the rigidbody collision radius is (always a circle)
    collisionRadius = 12;
    // If, at any point, a shadow intersects with the core, the ball pops.
    coreRadius = 4;

    // calculating this on startup means that we don't have to re-calculate death time every single frame,
    // which is a microoptimization. However, it also means that the death time doesn't update if params.lifespan
    // changes after it's spawned.
    timeoutTime = millis() + params.lifespan * random(800, 1200); // 1000ms per second, + a bit of jitter

    // keeping track of the # of bounces to be used with params.maxBounces (unused)
    bounceCount = 0;

    // color of the paint
    color;
    
    // saving state information for the future ----------------------------------------------------------
    coreTouched = false;
    bounced = false;
    bounceStrength = 0;
    prevFrameVel= createVector(0, 0);

    constructor(palette) {
        // Balls only spawn on the upper 2/3rds of the screen.
        let spawn_left = random() < 0.5;
        let spawn_top = random() < 0.5;

        this.pos.x = spawn_left? -this.visualRadius : captureWidth + this.visualRadius;
        this.pos.y = spawn_top? random(0, captureHeight / 3) : random(captureHeight / 3, captureHeight * 2 / 3);

        this.vel.x = random(ballVelXMin, ballVelXMax)
        if (!spawn_left)
        {
            this.vel.x *= -1;
        }
        this.vel.y = spawn_top? 0 : -random(ballVelYMin, ballVelYMax);

        this.color = color('#' + random(palette));

        if (this.isDead())
        {
            print("INVALID STARTING CONFIGURATION");
        }
    }

    update(silhouettes)
    {
        
        this.prevFrameVel = createVector(this.vel.x, this.vel.y);
        this.bounced = false;

        this.vel.add(0, params.gravity);
        let candiatePos = p5.Vector.add(this.pos, this.vel);

        if (candiatePos.y + this.collisionRadius > captureHeight)
        {
            this.bounced = true;
            this.bounceStrength = this.vel.mag();
            ++this.bounceCount;

            this.vel = createVector(this.vel.x, -this.vel.y).mult(params.bouncinessGround);
        }
        else
        {
            const [collisionHappened, coreTouched, newPosAfterCollision, newVel] = this.resolveCollision(silhouettes, prevFrameOutputCanvas, candiatePos.x, candiatePos.y, this.collisionRadius, this.coreRadius)
            if (coreTouched)
            {
                this.coreTouched = true;
            }
            else if (collisionHappened)
            {
                ++this.bounceCount;
                this.bounced = true;
                this.bounceStrength = this.vel.mag();

                this.pos = newPosAfterCollision;
                this.vel = newVel;
            }
        }

        this.pos.add(this.vel);
    }

    // returns [collisionHappened, coreTouched, newPos, newVel]
    resolveCollision(silhouettes, prevFrame, centerX, centerY, radius, innerRadius)
    {
        let tallyRight = 0;
        let tallyDown = 0;

        let radius_sqr = radius ** 2;
        let innerRadius_sqr = innerRadius ** 2;
        let collisionHappened = false;
        let coreTouched = false;

        let clostestSqDist = radius_sqr * 10 // squared distance of the closest pixel that is black
        let closestX; // x coordinate of the closest pixel that is black
        let closestY; // y coordinate of the closest pixel that is black

        for (let x = centerX - radius; x <= centerX + radius; x++)
        {
            for (let y = centerY - radius; y <= centerY + radius; y++)
            {
                // Check if the pixel is within the bounds of the image
                if (x < 0 || x >= silhouettes.width || y < 0 || y >= silhouettes.height)
                {
                    continue;
                }

                // Check if the pixel is actually within the circle
                let sqr_dist = (x - centerX)**2 + (y - centerY)**2 // square distance from center of circle
                if ( sqr_dist > radius_sqr)
                {
                    continue;
                }

                // check if pixel is valid to interpret silhouettes
                let p = prevFrame.get(x, y);
                if (p[0] <= epsilon || p[1] <= epsilon || p[2] <= epsilon)
                {
                    // continue;
                }

                // Check if input is black
                let s = silhouettes.get(x, y);
                if (s[0] <= epsilon && s[1] <= epsilon && s[2] <= epsilon)
                {
                    collisionHappened = true;
                    if (sqr_dist <= innerRadius_sqr)
                    {
                        coreTouched = true;
                        // early exit.
                        return [collisionHappened, coreTouched, this.pos, this.vel];
                    }
                    tallyRight += x < centerX ? -1 : 1
                    tallyDown += y < centerY ? -1 : 1

                    if (sqr_dist < clostestSqDist)
                    {
                        clostestSqDist = sqr_dist;
                        closestX = x;
                        closestY = y;
                    }
                }
            }
        }

        if (collisionHappened)
        {

            let normal = createVector(tallyRight, tallyDown);
            let addedForce = createVector(tallyRight, tallyDown).setMag(radius - sqrt(clostestSqDist)).mult(-0.5);
            
            let newVel = createVector(this.vel.x, this.vel.y);
            newVel.reflect(normal).mult(params.bounciness).add(addedForce);
            
            let positionDisplacement = createVector(tallyRight, tallyDown).setMag(radius - sqrt(clostestSqDist)).mult(-2);
            let newPos = createVector(this.pos.x, this.pos.y).add(positionDisplacement)
            
            return [collisionHappened, coreTouched, newPos, newVel];
        }
        return [false, false, this.pos, this.vel]
    }

    draw(frontBuffer, backBuffer, silhouettes)
    {
        // Draw body -----------------------------------------------
        frontBuffer.push();
        frontBuffer.noStroke();
        frontBuffer.fill(params.ballColour);

        frontBuffer.translate(this.pos.x, this.pos.y);
        frontBuffer.rotate(this.vel.heading());

        let stretchFactor = this.vel.mag() * params.squishiness;
        let wobbleFactor = sin(frameCount * params.wobbleFreq) * params.wobbleAmp * this.vel.mag();
        let effectiveRadius = this.visualRadius;
        if (millis() >= this.timeoutTime)
        {
            effectiveRadius *= map(millis(), this.timeoutTime, this.timeoutTime + params.shrinkTime, 1, 0, true);
        }
        
        frontBuffer.ellipse(0, 0, effectiveRadius * (2 + stretchFactor + wobbleFactor), effectiveRadius * (2 - stretchFactor - wobbleFactor));

        frontBuffer.pop();

        // Draw paint ---------------------------------------------
        if (this.vel.mag() > params.paintStreakVelThreshold && random() < params.paintStreakChance)
        {

            backBuffer.push();
            backBuffer.noStroke();
            backBuffer.fill(this.color);
            
            backBuffer.translate(this.pos.x, this.pos.y);
            backBuffer.rotate(this.vel.heading());
            
            let paintRadius = random(1, 3);
            backBuffer.ellipse(
                random(-this.coreRadius, this.coreRadius),
                random(-this.coreRadius, this.coreRadius),
                paintRadius * (1+this.vel.mag() * 0.5),
                paintRadius);
            backBuffer.ellipse(
                random(-this.coreRadius, this.coreRadius),
                random(-this.coreRadius, this.coreRadius),
                paintRadius,
                paintRadius);
            backBuffer.pop();
        }
        if (this.bounced)
        {
            backBuffer.push();
            backBuffer.noStroke();
            backBuffer.fill(this.color);

            let splatterRadius = this.bounceStrength * params.bouncePaintSplatterRadius;
            let numSplatter = params.bouncePaintSplatterDensity * splatterRadius ** 2;
            for (let i = 0; i < numSplatter; ++i)
            {
                let paintRadius = random(0.5, 1.0);

                let a = random(0, 2*PI);
                let r = random() ** 2 * splatterRadius; // raised by power to concentrate more towards middle
                
                let x = this.pos.x + r * cos(a);
                let y = this.pos.y + r * sin(a);

                let s = silhouettes.get(x, y);
                if (s[0] > epsilon && s[1] > epsilon && s[2] > epsilon)
                {
                    backBuffer.circle(x,y, paintRadius);
                }               
            }

            backBuffer.pop();
        }
        
        
        if (this.coreTouched)
        {
            backBuffer.push();
            backBuffer.noStroke();
            backBuffer.fill(this.color);

            let splatterRadius = params.poppedPaintSplatterRadius;
            let numSplatter = params.poppedPaintSplatterDensity * splatterRadius ** 2;
            for (let i = 0; i < numSplatter; ++i)
            {
                let paintRadius = random(1.0, 2.5);

                let a = random(0, 2*PI);
                let r = random() ** 5 * splatterRadius; // raised by power to concentrate more towards middle
                
                let x = this.pos.x + r * cos(a);
                let y = this.pos.y + r * sin(a);

                let s = silhouettes.get(x, y);
                if (s[0] > epsilon && s[1] > epsilon && s[2] > epsilon)
                {
                    backBuffer.circle(x,y, paintRadius);
                }
            }

            backBuffer.pop();
        }
    }

    isDead()
    {
        // if (millis() >= this.deathTime)
        //     print("Too old")
        // if (this.coreTouched)
        //     print("core touched")
        // if (this.pos.x > captureWidth && this.vel.x > 0)
        //     print("Off right edge")
        // if (this.pos.x < 0 && this.vel.x < 0)
        //     print("Off left edge")
        return millis() >= this.timeoutTime + params.shrinkTime ||
            this.coreTouched ||
            // this.bounceCount > params.maxBounces ||
            (this.pos.x > captureWidth + this.visualRadius && this.vel.x > 0) ||
            (this.pos.x < -this.visualRadius && this.vel.x < 0);
    }
}