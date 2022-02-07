precision highp float;
varying vec2 Uv;
uniform sampler2D OldVelocitysTexture;
uniform sampler2D PositionsTexture;

const float Drag = 0.1;
const float GravityY = -6.0;

void main()
{
	vec4 Velocity = texture2D( OldVelocitysTexture, Uv );
	
	//	apply drag
	vec3 Damping = vec3( 1.0 - Drag );
	Velocity.xyz *= Damping;
	
	//	accumulate forces
	float GravityMult = Velocity.w;
	vec3 GravityForce = vec3(0,GravityY*GravityMult,0);
	vec3 Force = vec3(0,0,0);
	Force += GravityForce;

	//	do collisions with projectiles (add to force)
	//	and enable graivty
	const bool Collision = false;
	if ( Collision )
	{
		Force += vec3(0,0,10.0);
		GravityMult = 1.0;
	}
	
	//	apply forces
	Velocity.xyz += Force;
	Velocity.w = GravityMult;
	
	gl_FragColor = Velocity;
}

