precision highp float;
varying vec2 Uv;
uniform sampler2D OldVelocitysTexture;
uniform sampler2D PositionsTexture;
uniform vec2 TexelSize;
#define SampleUv	Uv//( Uv + TexelSize * 0.5 )

const float AirDrag = 0.001;
const float FloorDrag = 0.7;
const float GravityY = -6.0;

#define MAX_PROJECTILES	100
//	projectile should probably be oldpos newpos to get force, pos, and not miss a fast projectile
uniform vec4 ProjectilePrevPos[MAX_PROJECTILES];
uniform vec4 ProjectileNextPos[MAX_PROJECTILES];
uniform float CubeSize;//	radius
#define ProjectileRadius	(CubeSize*7.0)	//	scale to make it a bit easier to hit stuff

const float Timestep = 1.0/60.0;
uniform vec3 Random4;
const float FloorY = 0.0;

float TimeAlongLine3(vec3 Position,vec3 Start,vec3 End)
{
	vec3 Direction = End - Start;
	float DirectionLength = length(Direction);
	if ( DirectionLength < 0.0001 )
		return 0.0;
	float Projection = dot( Position - Start, Direction) / (DirectionLength*DirectionLength);
	
	return Projection;
}

vec3 NearestToLine3(vec3 Position,vec3 Start,vec3 End)
{
	float Projection = TimeAlongLine3( Position, Start, End );
	
	//	clip to start & end of line
	Projection = clamp( Projection, 0.0, 1.0 );

	vec3 Near = mix( Start, End, Projection );
	return Near;
}

float Sign(float x)
{
	return ( x < 0.0 ) ? -1.0 : 1.0;
}

vec3 Sign3(vec3 xyz)
{
	return vec3( Sign(xyz.x), Sign(xyz.y), Sign(xyz.z) );
}

//	w=hit
vec4 GetProjectileForce(vec3 Position,vec4 ProjectilePrevPos,vec4 ProjectileNextPos)
{
	//	.w = is valid
	float Hit = ProjectilePrevPos.w;
	
	//	get distance to projectile line
	vec3 NearestToLine = NearestToLine3( Position, ProjectilePrevPos.xyz, ProjectileNextPos.xyz );
	vec3 ProjectileDelta = ProjectileNextPos.xyz - ProjectilePrevPos.xyz;
	float Distance = length(NearestToLine-Position);
	
	float MinDistance = CubeSize + ProjectileRadius;
	if ( Distance > MinDistance )
		Hit = 0.0;
	
	//	if the delta is 1/60th, the velocity must be 60*?
	float ProjectileForce = length(ProjectileDelta) * 60.0;
	
	//	normalise delta vector so we can add some randomness
	ProjectileDelta = normalize(ProjectileDelta);
	//	make it random mostly in the direction of the existing vector
	//	subtract some so it could bounce forward
	float RandomScale = 0.9;
	vec3 Random = Random4.xyz;// - vec3(0.5,0.5,0.5);
	ProjectileDelta += -Sign3(ProjectileDelta) * Random * RandomScale;
	ProjectileDelta = normalize(ProjectileDelta);
	
	vec3 Force = (ProjectileDelta * ProjectileForce) * 20.0;
	
	//	zero out if not hit
	//	gr: if force is Nan this stays nan
	if ( Hit == 0.0 )
		Force = vec3(0,0,0);
	//Force *= Hit;
	
	return vec4( Force, Hit );
}

//	w=hit
vec4 GetFloorBounceForce(vec3 Position,vec3 Velocity)
{
	if ( Position.y > FloorY )
	{
		return vec4(0,0,0,0);
	}
	
	//	under floor, reflect
	vec3 Bounce = reflect( Velocity, vec3(0,1,0) );
	//Bounce.y = max( Bounce.y, 0.0 );
	//	this bounce should just be the same length as velocity
	//	but the force we add is multiplied by timestep (maybe it shouldnt be)
	//	so for a true reflection, multiply by inverse timestep
	Bounce *= 1.0/Timestep;
	Bounce *= 1.0 - FloorDrag;
	return vec4(Bounce,1.0);
}


void main()
{
	vec4 Velocity = texture2D( OldVelocitysTexture, SampleUv );
	vec3 Position = texture2D( PositionsTexture, SampleUv ).xyz;
	
	//	apply drag
	vec3 Damping = vec3( 1.0 - AirDrag );
	Velocity.xyz *= Damping;
	
	//	accumulate forces
	float GravityMult = Velocity.w;
	vec3 GravityForce = vec3(0,GravityY*GravityMult,0);
	vec3 Force = vec3(0,0,0);

	//	do collisions with projectiles (add to force)
	//	and enable graivty
	for ( int p=0;	p<MAX_PROJECTILES;	p++ )
	{
		vec4 ProjectileHit = GetProjectileForce( Position, ProjectilePrevPos[p], ProjectileNextPos[p] );
		Force += ProjectileHit.xyz;
		GravityMult = max( GravityMult, ProjectileHit.w );
	}
	
	//	hit with floor
	if ( GravityMult > 0.0 )
	{
		vec4 FloorForce = GetFloorBounceForce(Position.xyz,Velocity.xyz);
		//	hit floor
		if ( FloorForce.w > 0.0 )
		{
			GravityForce = vec3(0,0,0);
			//GravityMult = 0.0;
			Force += FloorForce.xyz;
			//Position.y = FloorY;
			Velocity = vec4(0,0,0,0);
		}
	}

	Force += GravityForce;
	
	
	//	apply forces
	Velocity.xyz += Force * Timestep;
	Velocity.w = GravityMult;
	
	gl_FragColor = Velocity;
}

